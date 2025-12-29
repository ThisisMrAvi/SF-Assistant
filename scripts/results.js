import { dom } from "./dom.js";
import { state } from "./state.js";
import { exportCSV, exportJSON } from './utils.js';

// Store listeners at module level so they persist between function calls
const listeners = {
    hideAtt: (e) => toggleAttributeColumns(e),
    copyCSV: (e) => exportCSV(e, null, dom.resultDiv, true),
    copyJSON: (e) => exportJSON(e, null, dom.resultDiv, true),
    exportCSV: (e) => exportCSV(e, null, dom.resultDiv, false),
    exportJSON: (e) => exportJSON(e, null, dom.resultDiv, false),
    filter: filterTable
};

const RENDER_BATCH_SIZE = 2000;

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
        dom.resultDiv.innerHTML = '<p class="no-data">No records found</p>';
        return;
    }

    initResultActions();
    dom.resultContainer.classList.remove('hidden');

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
    const initialRowCount = Math.min(RENDER_BATCH_SIZE, flattenedRows.length);
    for (let i = 0; i < initialRowCount; i++) {
        tbody.appendChild(createTableRow(flattenedRows[i], keys));
    }

    table.appendChild(tbody);
    fragment.appendChild(table);

    // Clear and append new content
    dom.resultDiv.innerHTML = '';
    dom.resultDiv.appendChild(fragment);

    // Store data for loading more rows
    dom.resultDiv._allRows = flattenedRows;
    dom.resultDiv._keys = keys;
    dom.resultDiv._currentIndex = initialRowCount;
    dom.resultDiv._tbody = tbody;

    // Initialize "Load More" button if there are more rows
    if (flattenedRows.length > initialRowCount) {
        initLoadMoreButton(flattenedRows.length);
    }

    dom.filterResultText.innerText = `Showing ${initialRowCount} of ${result.records.length} records`;
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
        if (typeof value === 'string' && value.trim().toLowerCase().startsWith('<a ')) {
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

function initLoadMoreButton(totalRows) {
    // Remove existing load more button if present
    const existingBtn = dom.resultDiv.querySelector('.load-more-btn-container');
    if (existingBtn) {
        existingBtn.remove();
    }

    // Create container for load more button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'load-more-btn-container';
    buttonContainer.style.cssText = 'text-align: center; padding: 16px; margin-top: 10px;';

    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = `Load ${RENDER_BATCH_SIZE} More`;
    loadMoreBtn.style.cssText = 'padding: 8px 16px; background: var(--button-bg); color: var(--button-text); border: none; border-radius: 4px; cursor: pointer; font-size: 14px;';

    loadMoreBtn.addEventListener('click', () => {
        const allRows = dom.resultDiv._allRows;
        const keys = dom.resultDiv._keys;
        const tbody = dom.resultDiv._tbody;
        let currentIndex = dom.resultDiv._currentIndex;
        const batchSize = Math.max(RENDER_BATCH_SIZE, Math.ceil(totalRows / 5));

        // Load next batch
        const endIndex = Math.min(currentIndex + batchSize, allRows.length);
        for (let i = currentIndex; i < endIndex; i++) {
            tbody.appendChild(createTableRow(allRows[i], keys));
        }

        currentIndex = endIndex;
        dom.resultDiv._currentIndex = currentIndex;

        // Update count
        dom.filterResultText.innerText = `Showing ${currentIndex} of ${totalRows} records`;

        // Remove button if all rows loaded
        if (currentIndex >= allRows.length) {
            buttonContainer.remove();
        }
    });

    buttonContainer.appendChild(loadMoreBtn);
    dom.resultDiv.appendChild(buttonContainer);
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