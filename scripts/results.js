import { dom } from "./dom.js";
import { state } from "./state.js";

export function initResultActions() {
    dom.exportCSVBtn.addEventListener('click', exportCSV);
    dom.exportJSONBtn.addEventListener('click', exportJSON);
    dom.filterInput.addEventListener('input', filterTable);
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

    let html = '<table><thead><tr>';
    keys.forEach(k => html += `<th>${k}</th>`);
    html += '</tr></thead><tbody>';

    flattenedRows.forEach(row => {
        html += '<tr>';
        keys.forEach(k => {
            const v = row[k] ?? '';
            html += `<td>${v}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    dom.resultDiv.innerHTML = html;
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

function filterTable() {
    const table = dom.resultDiv.querySelector('table');
    const filterVal = dom.filterInput.value;
    if (!table) {
        return;
    }
    const filterText = filterVal.toLowerCase().trim();
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    let filterRowsCount = 0;
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const match = cells.some((td) => td.textContent.toLowerCase().includes(filterText));
        if (match) {
            row.classList.remove('hidden');
            filterRowsCount++;
        } else {
            row.classList.add('hidden');
        }
    });
    if (filterRowsCount) {
        dom.filterResultText.innerText = `Showing ${filterRowsCount} out of ${rows.length} records`;
    } else {
        dom.filterResultText.innerText = `Showing ${rows.length} records`;
    }
}

// Export handlers
function exportCSV() {
    const table = dom.resultDiv.querySelector('table');
    if (!table) { return; }
    const rows = Array.from(table.querySelectorAll('tr:not(.hidden)')).map(tr =>
        Array.from(tr.querySelectorAll('th,td')).map(td => `"${(td.textContent || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    state.vscode.postMessage({ command: 'exportCSV', content: rows });
}

function exportJSON() {
    const table = dom.resultDiv.querySelector('table');
    if (!table) {
        return;
    }
    const headers = Array.from(table.querySelectorAll('thead tr:first-child th')).map(th => th.textContent);
    const rows = Array.from(table.querySelectorAll('tbody tr:not(.hidden)')).map(tr => {
        const obj = {};
        Array.from(tr.querySelectorAll('td')).forEach((td, idx) => obj[headers[idx]] = td.textContent);
        return obj;
    });
    state.vscode.postMessage({ command: 'exportJSON', content: rows });
}

