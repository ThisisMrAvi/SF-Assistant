import { dom } from "./dom.js";
import { state } from "./state.js";
import { debounce, handleCopy } from './utils.js';

// Store listeners at module level so they persist between function calls
const listeners = {
    hideAtt: (e) => toggleAttributeColumns(e),
    copyCSV: (e) => exportCSV(e, true),
    copyJSON: (e) => exportJSON(e, true),
    exportCSV: (e) => exportCSV(e, false),
    exportJSON: (e) => exportJSON(e, false),
    filter: filterTable
};

export function initResultActions() {
    // Clean setup - each element only gets one listener
    dom.hideAttBtn?.addEventListener('click', listeners.hideAtt);
    dom.copyCSVBtn?.addEventListener('click', listeners.copyCSV);
    dom.copyJSONBtn?.addEventListener('click', listeners.copyJSON);
    dom.exportCSVBtn?.addEventListener('click', listeners.exportCSV);
    dom.exportJSONBtn?.addEventListener('click', listeners.exportJSON);
    dom.filterInput?.addEventListener('input', listeners.filter);
}

// Toggle attribute columns visibility
function toggleAttributeColumns(event) {
    const iconSpan = event.currentTarget.querySelector('span');
    if (state.showAttributeColumns) {
        iconSpan.classList.remove('icon-hide');
        iconSpan.classList.add('icon-show');
    } else {
        iconSpan.classList.remove('icon-show');
        iconSpan.classList.add('icon-hide');
    }
    state.showAttributeColumns = !state.showAttributeColumns;
    const table = dom.resultDiv.querySelector('table');
    if (!table) return;

    // Get all attribute columns (columns with IDs that are links)
    const headerCells = table.querySelectorAll('th');
    const attributeColumnIndexes = [];

    headerCells.forEach((cell, index) => {
        if (cell.textContent.includes('[') && cell.textContent.includes(']')) {
            attributeColumnIndexes.push(index);
            cell.classList.toggle('hidden');
        }
    });

    // Toggle visibility of corresponding data cells
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        attributeColumnIndexes.forEach(index => {
            cells[index]?.classList.toggle('hidden');
        });
    });
}

export function renderResults(result) {
    if (dom.filterInput) {
        dom.filterInput.value = '';
    }
    if (!result || !result.records || !result.records.length) {
        dom.resultContainer.classList.add('hidden');
        dom.resultDiv.classList.remove('records-table');
        dom.resultDiv.innerHTML = '<p class="no-data">No records found</p>';
        return;
    }

    initResultActions();
    dom.resultContainer.classList.remove('hidden');
    dom.resultDiv.classList.add('records-table');

    const rows = result.records;
    const flattenedRows = rows.map(r => flattenRecord(r));
    const allKeys = new Set();
    flattenedRows.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)));
    const keys = Array.from(allKeys);

    // Create elements using DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Create headers
    keys.forEach(k => {
        const th = document.createElement('th');
        th.textContent = escapeHtml(k);
        // Hide attribute columns if state.showAttributeColumns is false
        if (!state.showAttributeColumns && k.includes('[') && k.includes(']')) {
            th.classList.add('hidden');
        }
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create tbody with virtual scroll container
    const tbody = document.createElement('tbody');

    // Create initial set of rows
    const initialRowCount = Math.min(50, flattenedRows.length);
    for (let i = 0; i < initialRowCount; i++) {
        tbody.appendChild(createTableRow(flattenedRows[i], keys));
    }

    table.appendChild(tbody);
    fragment.appendChild(table);

    // Clear and append new content
    dom.resultDiv.innerHTML = '';
    dom.resultDiv.appendChild(fragment);

    // Initialize lazy loading for remaining rows
    if (flattenedRows.length > initialRowCount) {
        initLazyLoading(tbody, flattenedRows, initialRowCount, keys);
    }

    dom.filterResultText.innerText = `Showing ${result.records.length} records`;
}

function flattenRecord(record, parentKey = '', result = {}) {
    for (const key in record) {
        if (key === 'attributes') {
            if (record.attributes?.type && record.attributes?.url) {
                // const url = state.orgInfo.instanceUrl + record.attributes.url;
                const id = record.attributes.url.split('/').pop();
                const url = `${state.orgInfo?.instanceUrl}/${id}`;
                result[parentKey ? `${parentKey} [${record.attributes.type}]` : `[${record.attributes.type}]`] =
                    `<a href="${url}" target="_blank">${id}</a>`;
            }
        } else if (typeof record[key] === 'object' && record[key] !== null && !Array.isArray(record[key])) {
            flattenRecord(record[key], parentKey ? `${parentKey}.${key}` : key, result);
        } else if (typeof record[key] === 'object' && record[key] !== null && Array.isArray(record[key])) {
            record[key].forEach((element, index) => {
                flattenRecord(element, parentKey ? `${parentKey}.${index}` : key, result);
            });
        } else {
            result[parentKey ? `${parentKey}.${key}` : key] = record[key];
        }
    }
    return result;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function createTableRow(rowData, keys) {
    const tr = document.createElement('tr');
    keys.forEach(k => {
        const td = document.createElement('td');
        const value = rowData[k] ?? '';
        // Only use innerHTML for known HTML content (links), otherwise use textContent
        if (value.startsWith('<a href=')) {
            td.innerHTML = value;
            // Hide attribute columns if state.showAttributeColumns is false
            if (!state.showAttributeColumns && k.includes('[') && k.includes(']')) {
                td.classList.add('hidden');
            }
        } else {
            td.textContent = value;
        }
        tr.appendChild(td);
    });
    return tr;
}

function initLazyLoading(tbody, allRows, startIndex, keys) {
    const batchSize = 50;
    let currentIndex = startIndex;

    const loadMoreRows = () => {
        const scrollElement = tbody.parentElement;
        const threshold = 100; // pixels from bottom

        if (scrollElement.scrollHeight - (scrollElement.scrollTop + scrollElement.clientHeight) < threshold) {
            const fragment = document.createDocumentFragment();
            const endIndex = Math.min(currentIndex + batchSize, allRows.length);

            for (let i = currentIndex; i < endIndex; i++) {
                fragment.appendChild(createTableRow(allRows[i], keys));
            }

            tbody.appendChild(fragment);
            currentIndex = endIndex;

            if (currentIndex >= allRows.length) {
                scrollElement.removeEventListener('scroll', scrollHandler);
            }
        }
    };

    const scrollHandler = debounce(loadMoreRows, 100);
    tbody.parentElement.addEventListener('scroll', scrollHandler);
}

function filterTable() {
    const table = dom.resultDiv.querySelector('table');
    const filterVal = dom.filterInput.value;
    if (!table) {
        return;
    }

    const filterText = filterVal.toLowerCase().trim();
    const rows = table.querySelectorAll('tbody tr');
    let filterRowsCount = 0;

    // Use requestAnimationFrame for smooth UI updates
    requestAnimationFrame(() => {
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            const match = Array.from(cells).some(td =>
                td.textContent.toLowerCase().includes(filterText)
            );

            row.classList.toggle('hidden', !match);
            if (match) filterRowsCount++;
        }

        dom.filterResultText.innerText = filterRowsCount
            ? `Showing ${filterRowsCount} out of ${rows.length} records`
            : `Showing ${rows.length} records`;
    });
}

// Export handlers
function exportCSV(e, isCopy) {
    const table = dom.resultDiv.querySelector('table');
    if (!table) { return; }

    // Get visible headers and their indices
    const headers = Array.from(table.querySelectorAll('thead tr:first-child th'));
    const visibleColumns = headers.reduce((acc, th, index) => {
        if (!th.classList.contains('hidden')) {
            acc.push(index);
        }
        return acc;
    }, []);

    // Map rows with only visible columns
    const rows = Array.from(table.querySelectorAll('tr:not(.hidden)')).map(tr => {
        const cells = Array.from(tr.querySelectorAll('th,td'));
        return visibleColumns
            .map(idx => `"${(cells[idx]?.textContent || '').replace(/"/g, '""')}"`)
            .join(',');
    }).join('\n');

    if (isCopy) {
        handleCopy(e.currentTarget, rows);
    } else {
        state.vscode.postMessage({ command: 'exportCSV', content: rows, obj: state.currentObject });
    }
}

function exportJSON(e, isCopy) {
    const table = dom.resultDiv.querySelector('table');
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
    const rows = Array.from(table.querySelectorAll('tbody tr:not(.hidden)')).map(tr => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const obj = {};
        visibleColumns.forEach(({ index, text }) => {
            obj[text] = cells[index]?.textContent || '';
        });
        return obj;
    });

    if (isCopy) {
        handleCopy(e.currentTarget, JSON.stringify(rows, null, 2));
    } else {
        state.vscode.postMessage({ command: 'exportJSON', content: rows, obj: state.currentObject });
    }
}

