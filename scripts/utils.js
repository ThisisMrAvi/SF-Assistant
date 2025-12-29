import { dom } from "./dom.js";
import { showNotification } from "./main.js";
import { getObjectList, state } from './state.js';

export function sendTextUpdateEvent(elm = dom.queryInput) {
    const inputEvent = new Event('input', { bubbles: true });
    elm.dispatchEvent(inputEvent);
}

// Throttle DOM updates using requestAnimationFrame
export function safeUpdateStatus(msg, color) {
    if (!dom.statusBar) {
        return;
    }
    if (dom.statusBar.textContent === msg) {
        return;
    }
    requestAnimationFrame(() => {
        dom.statusBar.style.display = 'block';
        dom.statusBar.style.color = color;
        dom.statusBar.textContent = msg;
    });
}

export function updateSelectedSuggestion(suggestionsDiv) {
    Array.from(suggestionsDiv.children).forEach((child, i) => {
        child.classList.toggle('selected', i === state.selectedSuggestionIndex);
    });
}

// Simple debounce helper
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function validObjectName(objectName) {
    if (!objectName) {
        return false;
    }
    const currObjList = getObjectList();
    const objExist = currObjList.find(obj => (obj.name || '').toLowerCase() === objectName.toLowerCase());
    return objExist;
}

// Store timeouts in a WeakMap to avoid adding properties to DOM elements
const copyTimeouts = new WeakMap();
const COPY_FEEDBACK_DURATION = 3000;

export async function handleCopy(btn, textToCopy, duration = COPY_FEEDBACK_DURATION) {
    if (!btn) {
        return;
    }

    // Cache icon element
    const iconSpan = btn.querySelector('.icon');

    // Clean up any existing timeout
    const existingTimeout = copyTimeouts.get(btn);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        if (iconSpan) {
            iconSpan.classList.remove('icon-copied');
            iconSpan.classList.add('icon-copy');
        }
    }

    try {
        // Attempt to copy text
        await navigator.clipboard.writeText(textToCopy);
        if (iconSpan) {
            iconSpan.classList.remove('icon-copy');
            iconSpan.classList.add('icon-copied');
        }
        showNotification('Copied to clipboard', 'success');

        // Set up automatic reset
        const timeoutId = setTimeout(() => {
            if (iconSpan) {
                iconSpan.classList.remove('icon-copied');
                iconSpan.classList.add('icon-copy');
            }
            copyTimeouts.delete(btn);
        }, duration);

        copyTimeouts.set(btn, timeoutId);
    } catch (error) {
        console.error('Copy failed:', error);
        showNotification('Failed to copy to clipboard', 'error');
    }
}



// Export handlers
export function exportCSV(e, csvData, tableContainer, isCopy) {
    if (tableContainer && !csvData) {
        const table = tableContainer.querySelector('table');
        if (!table) {
            return;
        }
        // Get all visible rows (header + body)
        const trs = Array.from(table.querySelectorAll('tr:not(.hidden)'));
        if (trs.length === 0) {
            return;
        }

        // Build visible column index from the first row (header)
        const firstRowCells = Array.from(trs[0].children);
        const visibleColumns = firstRowCells
            .map((cell, index) => cell.classList.contains('hidden') ? -1 : index)
            .filter(i => i !== -1);

        // Convert all rows into CSV
        csvData = trs.map(tr => {
            const cells = Array.from(tr.children);
            return visibleColumns
                .map(i => {
                    const value = cells[i]?.textContent || '';
                    return `"${value.replace(/"/g, '""')}"`;
                })
                .join(',');
        }).join('\n');
    }

    if (isCopy) {
        handleCopy(e.currentTarget, csvData);
    } else {
        state.vscode.postMessage({
            command: 'exportCSV',
            content: csvData,
            obj: state.currentObject
        });
    }
}


export function exportJSON(e, jsonData, tableContainer, isCopy) {
    if (tableContainer && !jsonData) {
        const table = tableContainer.querySelector('table');
        if (!table) {
            return;
        }

        // Get visible headers and their indices
        const headers = Array.from(table.querySelectorAll('thead tr:first-child th'));
        const visibleColumns = headers.reduce((acc, th, index) => {
            if (!th.classList.contains('hidden')) {
                acc.push({ index, text: th.textContent });
            }
            return acc;
        }, []);

        // Map rows with only visible columns
        jsonData = Array.from(table.querySelectorAll('tbody tr:not(.hidden)')).map(tr => {
            const cells = Array.from(tr.querySelectorAll('td'));
            const obj = {};
            visibleColumns.forEach(({ index, text }) => {
                obj[text] = cells[index]?.textContent || '';
            });
            return obj;
        });
    }

    if (isCopy) {
        handleCopy(e.currentTarget, JSON.stringify(jsonData, null, 2));
    } else {
        state.vscode.postMessage({ command: 'exportJSON', content: jsonData, obj: state.currentObject });
    }
}

/**
 * Make a table sortable by column headers
 * @param {HTMLTableElement} table - The table to make sortable
 * @param {Object} options - Configuration options
 * @param {boolean} options.numeric - Auto-detect numeric columns (default: true)
 * @param {string} options.indicator - Sort indicator style ('arrow' or 'symbol', default: 'symbol')
 */
export function makeTableSortable(table, options = {}) {
    const { numeric = true, indicator = 'symbol' } = options;
    const headers = table.querySelectorAll('thead th');

    headers.forEach((header, columnIndex) => {
        header.style.cursor = 'pointer';
        header.title = 'Click to sort';

        header.addEventListener('click', () => {
            sortTableByColumn(table, columnIndex, header, { numeric, indicator });
        });
    });
}

/**
 * Sort a table by a specific column
 * @param {HTMLTableElement} table - The table to sort
 * @param {number} columnIndex - The column index to sort by
 * @param {HTMLElement} headerElm - The header element for visual feedback
 * @param {Object} options - Configuration options
 */
export function sortTableByColumn(table, columnIndex, headerElm, options = {}) {
    const { numeric = true, indicator = 'symbol' } = options;
    const tbody = table.querySelector('tbody');

    if (!tbody) {
        return;
    }

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const isAscending = !headerElm.dataset.sorted || headerElm.dataset.sorted === 'desc';

    rows.sort((rowA, rowB) => {
        const cellA = rowA.children[columnIndex]?.textContent.trim() || '';
        const cellB = rowB.children[columnIndex]?.textContent.trim() || '';

        if (numeric) {
            const numA = parseFloat(cellA);
            const numB = parseFloat(cellB);

            // Compare as numbers if both are valid numbers
            if (!isNaN(numA) && !isNaN(numB)) {
                return isAscending ? numA - numB : numB - numA;
            }
        }

        // Compare as strings
        return isAscending ? cellA.localeCompare(cellB) : cellB.localeCompare(cellA);
    });

    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));

    // Update visual indicator on all headers
    const allHeaders = table.querySelectorAll('thead th');
    allHeaders.forEach(h => {
        const text = h.textContent.replace(/\s[▲▼→]$/, '');
        h.textContent = text;
        h.dataset.sorted = '';
    });

    // Set indicator on current header
    headerElm.dataset.sorted = isAscending ? 'asc' : 'desc';
    const indicatorChar = indicator === 'symbol' ? (isAscending ? ' ▲' : ' ▼') : (isAscending ? ' ↑' : ' ↓');
    headerElm.textContent += indicatorChar;
}