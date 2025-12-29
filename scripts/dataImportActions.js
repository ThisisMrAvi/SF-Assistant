import { dom } from "./dom.js";
import { showNotification } from "./main.js";
import { getObjectList, getObjectMeta, handleObjectListRequest, handleObjectMetadataRequest, state } from "./state.js";
import { debounce, exportCSV, exportJSON, makeTableSortable, validObjectName } from "./utils.js";

let dataLoadState = {
    records: [],
    fieldMapping: {},
    results: [],
    failedRecords: [],
    lastConfig: null,
};

// Store listeners at module level so they persist between function calls
const listeners = {
    copyCSV: (e, tableContainer) => exportCSV(e, null, tableContainer, true),
    copyJSON: (e, tableContainer) => exportJSON(e, null, tableContainer, true),
    exportCSV: (e, tableContainer) => exportCSV(e, null, tableContainer, false),
    exportJSON: (e, tableContainer) => exportJSON(e, null, tableContainer, false)
};

export function initDataImportActions() {
    if (!dom.runDataLoadBtn) {
        console.warn('Data load action button not found');
        // initialize after a short delay in case DOM is not ready yet
        setTimeout(initDataImportActions, 2000);
        return;
    }

    // Initialize autocomplete for object name
    if (dom.objectName) {
        initObjectNameAutocomplete(dom.objectName, dom.apiType);
    }

    // Update button text based on action type
    dom.actionType?.addEventListener('change', (e) => {
        const actionName = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1);
        dom.runDataLoadBtn.textContent = `Run ${actionName}`;
    });

    // Handle data input parsing - trigger on both input and change
    dom.dataInput?.addEventListener('change', () => {
        try {
            parseAndValidateData(dom.dataInput.value);
            regenerateDataPreview();
        } catch (err) {
            console.warn('Data parsing error:', err);
        }
    });

    dom.dataInput?.addEventListener('input', () => {
        try {
            parseAndValidateData(dom.dataInput.value);
            regenerateDataPreview();
        } catch (err) {
            console.warn('Data parsing error:', err);
        }
    });

    // Handle Run button click
    dom.runDataLoadBtn?.addEventListener('click', handleDataLoad);

    // Handle cancel button click
    dom.cancelDataLoadBtn?.addEventListener('click', () => {
        const message = { command: 'cancelDataLoad' };
        state.vscode.postMessage(message);
        if (dom.runDataLoadBtn) {
            dom.runDataLoadBtn.disabled = false;
            dom.runDataLoadBtn.textContent = 'Run Update'; // Reset to default
        }
        if (dom.cancelDataLoadBtn) {
            dom.cancelDataLoadBtn.disabled = true;
        }
        console.log('[Data Load] Cancel requested');
    });

    // Handle retry button click
    dom.retryButton?.addEventListener('click', async () => {
        if (!dataLoadState.failedRecords || dataLoadState.failedRecords.length === 0) {
            showNotification('No failed records to retry', 'warning');
            return;
        }

        const config = dataLoadState.lastConfig;
        if (!config) {
            showNotification('Configuration lost. Please re-run the data load.', 'error');
            return;
        }

        // Prepare data for retry
        const message = {
            command: 'runDataLoad',
            ...config,
            data: JSON.stringify(dataLoadState.failedRecords),
        };
        state.vscode.postMessage(message);
        dom.retryButton.disabled = true;
        dom.retryButton.textContent = 'Retrying...';
        dom.runDataLoadBtn.disabled = true;
        resetDataImportState();
    });

    // Handle preview copy buttons
    dom.copyPreviewCSVBtn?.addEventListener('click', (e) => {
        listeners.copyCSV(e, dom.previewContainer);
    });

    dom.copyPreviewJSONBtn?.addEventListener('click', (e) => {
        listeners.copyJSON(e, dom.previewContainer);
    });

    // Handle results copy buttons
    dom.copyResultsCSVBtn?.addEventListener('click', (e) => {
        listeners.copyCSV(e, dom.importResultsTable);
    });

    dom.copyResultsJSONBtn?.addEventListener('click', (e) => {
        listeners.copyJSON(e, dom.importResultsTable);
    });

    // Handle results export buttons
    dom.exportResultsCSVBtn?.addEventListener('click', (e) => {
        listeners.exportCSV(e, dom.importResultsTable);
    });

    dom.exportResultsJSONBtn?.addEventListener('click', (e) => {
        listeners.exportJSON(e, dom.importResultsTable);
    });
}

/**
 * Resets state and UI elements for new data import
 */
function resetDataImportState() {
    if (dom.cancelDataLoadBtn) {
        dom.cancelDataLoadBtn.disabled = false;
    }
    if (dom.importResultsSection) {
        dom.importResultsSection.classList.remove('hidden');
        dom.importResultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    if (dom.importResultsTable) {
        dom.importResultsTable.innerHTML = '';
    }
    if (dom.importSummaryDiv) {
        dom.importSummaryDiv.className = 'data-load-progress';
        dom.importSummaryDiv.innerHTML = `<span style="color: #00a008ff;">Executing ${dataLoadState.lastConfig.actionType} on ${dataLoadState.lastConfig.objectName}...</span>`;
    }

    // Clear results from last run
    dataLoadState.failedRecords = [];
    dataLoadState.results = [];
}

/**
 * Parse and validate input data (CSV or JSON)
 */
function parseAndValidateData(data) {
    try {
        // Try JSON first
        dataLoadState.records = JSON.parse(data);
        if (!Array.isArray(dataLoadState.records)) {
            dataLoadState.records = [];
        }
    } catch {
        // Try CSV parsing
        dataLoadState.records = parseCSV(data);
    }

    if (dataLoadState.records.length > 0) {
        updateFieldMapping();
    }
}

/**
 * Parse CSV data
 */
function parseCSV(data) {
    const lines = data.trim().split('\n');
    if (lines.length < 2) {
        return [];
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^\"|\"$/g, '').replace(/^\'|\'$/g, ''));
    const records = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^\"|\"$/g, '').replace(/^\'|\'$/g, ''));
        const record = {};
        headers.forEach((header, idx) => {
            record[header] = values[idx] || '';
        });
        records.push(record);
    }

    return records;
}

/**
 * Extract field names from first record and create mapping
 */
function extractFieldMapping() {
    if (dataLoadState.records.length === 0) {
        return {};
    }

    const firstRecord = dataLoadState.records[0];
    const mapping = {};

    const mappingInputs = Array.from(document.querySelectorAll('.field-mapping-input'));
    Object.keys(firstRecord).forEach(fieldName => {
        // Find the input whose data-source-field equals the fieldName (avoid using attribute selector with raw values)
        const mappedInput = mappingInputs.find(i => i.getAttribute('data-source-field') === fieldName);

        if (!mappedInput) {
            mapping[fieldName] = fieldName;
        } else if (mappedInput.disabled) {
            // Field is skipped
            mapping[fieldName] = null;
        } else {
            mapping[fieldName] = mappedInput.value || fieldName;
        }
    });

    dataLoadState.fieldMapping = mapping;
    return mapping;
}

/**
 * Apply field mapping to transform records
 * Maps source field names to target field names in Salesforce
 * Skips fields where mapping is null
 */
function applyFieldMapping(records, fieldMapping) {
    return records.map(record => {
        const transformedRecord = {};

        // For each source field in the record, map it to the target field name
        Object.keys(record).forEach(sourceField => {
            const mapping = fieldMapping[sourceField];

            // Skip null mappings (field is marked as skip)
            if (mapping === null) {
                return;
            }

            const targetField = mapping || sourceField;
            transformedRecord[targetField] = record[sourceField];
        });

        return transformedRecord;
    });
}

/**
 * Update field mapping UI section
 */
function updateFieldMapping() {
    const mappingContainer = document.getElementById('fieldMappingContainer');
    if (!mappingContainer || dataLoadState.records.length === 0) {
        return;
    }

    const firstRecord = dataLoadState.records[0];
    const fieldNames = Object.keys(firstRecord);

    // Auto-detect object name if possible
    if (dataLoadState.records.length > 2 && fieldNames.includes('Id') && !dom.objectName?.value) {
        const secondRecord = dataLoadState.records[1];
        const objList = getObjectList();
        const objName = objList.find(obj => obj.keyPrefix === secondRecord.Id.substring(0, 3))?.name;
        dom.objectName.value = objName;
    }

    // Clear existing mapping fields
    mappingContainer.innerHTML = '';

    // Create input fields for each detected field
    fieldNames.forEach(fieldName => {
        const label = document.createElement('label');
        const isSkipped = dataLoadState.fieldMapping[fieldName] === null;
        label.className = isSkipped ? 'field-mapping-row skipped' : 'field-mapping-row';
        label.innerHTML = `
            <span class="field-name" title="Click skip button to skip this field">${fieldName}</span>
            <div class="form-field" style="flex: 1; position: relative;">
                <input 
                    type="text"
                    class="field-mapping-input" 
                    data-source-field="${fieldName}" 
                    value="${isSkipped ? '' : fieldName}" 
                    ${isSkipped ? 'disabled' : ''} 
                />
                <div class="autocomplete-suggestions" style="display:none;"></div>
            </div>
            <button type="button" class="field-skip-btn" data-source-field="${fieldName}" title="${isSkipped ? 'Add' : 'Skip'}">${isSkipped ? '+' : '-'}</button>
        `;
        mappingContainer.appendChild(label);
    });

    // Add event listeners to field mapping inputs and buttons
    document.querySelectorAll('.field-mapping-input').forEach(input => {
        input.addEventListener('change', () => {
            const sourceField = input.getAttribute('data-source-field');
            dataLoadState.fieldMapping[sourceField] = input.value || sourceField;
            regenerateDataPreview();
        });
        input.addEventListener('input', () => {
            regenerateDataPreview();
        });
    });

    document.querySelectorAll('.field-skip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const sourceField = btn.getAttribute('data-source-field');
            const label = btn.closest('label');
            const input = label.querySelector('.field-mapping-input');

            if (dataLoadState.fieldMapping[sourceField] === null) {
                // Un-skip
                dataLoadState.fieldMapping[sourceField] = sourceField;
                label.classList.remove('skipped');
                input.disabled = false;
                input.value = sourceField;
                btn.textContent = '-';
                btn.title = 'Skip';
            } else {
                // Skip
                dataLoadState.fieldMapping[sourceField] = null;
                label.classList.add('skipped');
                input.disabled = true;
                input.value = '';
                btn.textContent = '+';
                btn.title = 'Add';
            }
            regenerateDataPreview();
        });
    });
}

/**
 * Regenerate data preview based on current field mapping
 */
function regenerateDataPreview() {
    if (!dataLoadState.records || dataLoadState.records.length === 0) {
        return;
    }
    // Apply current field mapping and render
    const transformedRecords = applyFieldMapping(dataLoadState.records, dataLoadState.fieldMapping);
    renderDataPreview(transformedRecords);
}

/**
 * Render data preview table from parsed records
 */
function renderDataPreview(records) {
    if (!dom.previewContainer) {
        return;
    }

    // Clear existing content
    dom.previewContainer.innerHTML = '';
    dom.previewContainer.classList.remove('hidden');

    if (!records || records.length === 0) {
        dom.previewContainer.innerHTML = '<p class="info-text" style="padding: 20px; text-align: center;">No data to preview</p>';
        return;
    }

    // Create table
    const table = document.createElement('table');

    // Create headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Get field names from first record
    const fieldNames = Object.keys(records[0] || {});
    fieldNames.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Create body with records
    const tbody = document.createElement('tbody');
    records.forEach((record, idx) => {
        const row = document.createElement('tr');
        row.id = `preview-row-${idx}`;

        // Data cells
        fieldNames.forEach(field => {
            const td = document.createElement('td');
            const value = record[field] || '';
            td.textContent = String(value).length > 100 ? String(value).substring(0, 100) + '...' : value;
            td.title = String(value);
            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    dom.previewContainer.appendChild(table);

    // Show record count
    let countDiv = document.getElementById('previewRecordCount');
    if (!countDiv) {
        countDiv = document.createElement('div');
        countDiv.id = 'previewRecordCount';
        countDiv.className = 'info-text';
        countDiv.style.margin = '10px';
        countDiv.style.textAlign = 'left';

        //Add countDiv to parent of previewContainer
        dom.previewContainer.parentElement.appendChild(countDiv);
    }
    countDiv.textContent = `${records.length} record${records.length !== 1 ? 's' : ''} ready to process`;


    // Show preview button row when data is present
    const previewButtonRow = document.getElementById('previewButtonRow');
    if (previewButtonRow) {
        previewButtonRow.style.display = records.length > 0 ? 'flex' : 'none';
    }
}


async function handleDataLoad(e) {
    let objName = dom.objectName?.value?.trim() || '';
    if (!objName || !dom.dataInput?.value) {
        showNotification('Please enter object name and data', 'warning');
        return;
    }

    if (!validObjectName(objName)) {
        showNotification(`Invalid object name: ${objName}`, 'error');
        return;
    }
    state.currentObject = objName;

    const fieldMapping = extractFieldMapping();
    console.log('[Data Load] Extracted field mapping:', fieldMapping);
    console.log('[Data Load] Number of records:', dataLoadState.records.length);
    if (dataLoadState.records.length > 0) {
        console.log('[Data Load] First record:', dataLoadState.records[0]);
    }

    if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
        showNotification('No fields detected or field mapping is empty', 'error');
        return;
    }

    // Apply field mapping to transform records
    const transformedRecords = applyFieldMapping(dataLoadState.records, fieldMapping);
    console.log('[Data Load] Transformed records:', transformedRecords.slice(0, 1));

    // Validate action-specific requirements
    const actionType = dom.actionType?.value || 'update';

    // Update and Undelete require Id field in field mapping
    if ((actionType === 'update' || actionType === 'undelete')) {
        const hasIdField = Object.values(fieldMapping).includes('Id');
        if (!hasIdField) {
            showNotification(`${actionType.charAt(0).toUpperCase() + actionType.slice(1)} operation requires "Id" field`, 'error');
            return;
        }
    }

    // Save config for retry
    dataLoadState.lastConfig = {
        apiType: dom.apiType?.value || 'enterprise',
        actionType: actionType,
        objectName: objName,
        data: JSON.stringify(transformedRecords),
        batchSize: parseInt(dom.batchSize?.value) || 200,
        threads: parseInt(dom.threads?.value) || 6,
        fieldMapping: fieldMapping,
    };

    const message = {
        command: 'runDataLoad',
        ...dataLoadState.lastConfig,
    };

    state.vscode.postMessage(message);
    dom.runDataLoadBtn.disabled = true;
    dom.runDataLoadBtn.textContent = 'Processing...';

    resetDataImportState();
}

/**
 * Handle data load progress updates from extension
 */
export function handleDataLoadProgress(progress) {
    if (!dom.importSummaryDiv || !dom.importResultsTable) {
        console.warn('Import summary or results table container not found');
        return;
    }

    const { current, total, batchNumber, batchCount, batchResults } = progress;
    const percentage = Math.round((current / total) * 100);
    console.log(`Processing batch ${batchNumber}/${batchCount} - ${percentage}%`, batchResults?.length, 'results');

    dataLoadState.results.push(...(batchResults || []));
    // Push failed records
    if (batchResults && batchResults.length > 0) {
        batchResults.forEach(r => {
            if (!r.success) {
                dataLoadState.failedRecords.push(r);
            }
        });
    }

    const failCount = dataLoadState.failedRecords.length;
    const successCount = dataLoadState.results.length - failCount;

    // Update progress bar and info
    dom.importSummaryDiv.innerHTML = `
        <div class="progress-info">
            <span>Processing batch ${batchNumber}/${batchCount}</span>
            <span>${current}/${total} records</span>
            <span style="color: #4CAF50;">✓ ${successCount}</span>
            <span style="color: #dc3545;">✗ ${failCount}</span>
        </div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${percentage}%"></div>
        </div>
        <div class="progress-percentage">${percentage}%</div>
    `;

    // Build live results table with batch results
    if (batchResults && batchResults.length > 0 && dom.importResultsTable) {
        let resultsTable = dom.importResultsTable.querySelector('table');
        if (!resultsTable) {
            // Create table header
            resultsTable = document.createElement('table');
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            headerRow.innerHTML = `
                <th>Batch</th>
                <th>Status</th>
                <th>Record ID</th>
                <th>Message</th>
            `;
            thead.appendChild(headerRow);
            resultsTable.appendChild(thead);
            dom.importResultsTable.appendChild(resultsTable);
        }

        // Add rows for this batch's results
        let tbody = resultsTable.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            resultsTable.appendChild(tbody);
        }

        batchResults.forEach((result) => {
            const row = document.createElement('tr');
            row.setAttribute('data-result-id', `${batchNumber}-${result.index}`);
            row.className = result.success ? 'result-success' : 'result-failed';
            const statusIcon = result.success ? '✓' : '✗';
            const statusColor = result.success ? '#4CAF50' : '#dc3545';
            const errorMessage = result.errors && result.errors.length > 0 ? result.errors.join('; ') : '';
            row.innerHTML = `
                    <td>${batchNumber}</td>
                    <td style="color: ${statusColor}; font-weight: 600;">${statusIcon}</td>
                    <td>${result.id || '-'}</td>
                    <td>${errorMessage}</td>
                `;
            tbody.appendChild(row);
        });
    }
}

/**
 * Handle data load results from extension
 */
export function handleDataLoadResult(summary) {
    const { total, time } = summary;
    const failed = dataLoadState.failedRecords.length;
    const successful = dataLoadState.results.length - failed;
    console.log('[Data Load] Operation completed. Summary:', summary);

    // Show summary
    if (dom.importSummaryDiv) {
        dom.importSummaryDiv.className = 'data-load-summary';
        dom.importSummaryDiv.innerHTML = `
            <div class="summary-item info">
                <label>Total Records</label>
                <strong>${total}</strong>
            </div>
            <div class="summary-item success">
                <label>Successful</label>
                <strong style="color: #4CAF50;">${successful}</strong>
            </div>
            <div class="summary-item ${failed > 0 ? 'error' : 'success'}">
                <label>Failed</label>
                <strong style="color: ${failed > 0 ? '#dc3545' : '#4CAF50'};">${failed}</strong>
            </div>
            <div class="summary-item info">
                <label>Duration</label>
                <strong>${time}s</strong>
            </div>
        `;
    }

    // Create results table
    let resultsTable = document.querySelector('#importResultsTable table');
    if (resultsTable) {
        makeTableSortable(resultsTable);
    }

    // Re-enable run button and disable cancel button
    if (dom.runDataLoadBtn) {
        dom.runDataLoadBtn.disabled = false;
        const actionName = dom.actionType ? dom.actionType.value.charAt(0).toUpperCase() + dom.actionType.value.slice(1) : 'Run';
        dom.runDataLoadBtn.textContent = `Run ${actionName}`;
    }
    if (dom.cancelDataLoadBtn) {
        dom.cancelDataLoadBtn.disabled = true;
    }

    // Enable/disable retry button based on failed records
    if (dom.retryButton) {
        dom.retryButton.disabled = failed === 0;
        dom.retryButton.textContent = "Retry Failed";
    }

    // Show results button row when results are present
    const resultsButtonRow = document.getElementById('resultsButtonRow');
    if (resultsButtonRow) {
        // add or remove hidden class based on results length
        if (dataLoadState.results.length > 0) {
            resultsButtonRow.classList.remove('hidden');
        } else {
            resultsButtonRow.classList.add('hidden');
        }
    }
}

/**
 * Initialize autocomplete for object name input
 */
function initObjectNameAutocomplete(objectNameInput, apiTypeSelect) {
    // Create suggestions container
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.id = 'objectNameSuggestions';
    suggestionsContainer.className = 'autocomplete-suggestions';
    suggestionsContainer.style.display = 'none';
    objectNameInput.parentElement.appendChild(suggestionsContainer);

    getObjectList();

    // Use event delegation for suggestion clicks to avoid event listener issues
    suggestionsContainer.addEventListener('mousedown', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) {
            return;
        }

        e.preventDefault();
        const objectName = item.getAttribute('data-name');
        objectNameInput.value = objectName;
        suggestionsContainer.style.display = 'none';
        console.log('[Data Load] Selected object:', objectName);
        // Request field mapping for this object
        updateFieldMappingForObject(objectName, apiTypeSelect?.value);
    });

    // Handle input
    objectNameInput.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase().trim();

        if (!value) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        // Get current object list
        const objectList = getObjectList();
        if (!objectList || objectList.length === 0) {
            console.log('[Data Load] Object list is empty, requesting...');
            suggestionsContainer.style.display = 'none';
            handleObjectListRequest();
            return;
        }

        // Filter objects
        const filtered = objectList.filter(obj =>
            (obj.name && obj.name.toLowerCase().includes(value)) ||
            (obj.label && obj.label.toLowerCase().includes(value))
        );

        console.log('[Data Load] Filtered objects:', filtered.length, 'from', objectList.length);

        // Show suggestions
        if (filtered.length > 0) {
            suggestionsContainer.innerHTML = filtered.slice(0, 10).map((obj) =>
                `<div class="autocomplete-item" data-name="${obj.name}">
                    <strong>${obj.label}</strong> <span style="opacity: 0.6;">(${obj.name})</span>
                </div>`
            ).join('');
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    });

    // Hide suggestions on blur
    objectNameInput.addEventListener('blur', () => {
        setTimeout(() => {
            suggestionsContainer.style.display = 'none';
        }, 200);
    });

    // Reload when API type changes
    apiTypeSelect?.addEventListener('change', () => {
        objectNameInput.value = '';
        suggestionsContainer.style.display = 'none';
        handleObjectListRequest();
    });
}

/**
 * Update field mapping UI with Salesforce field names for selected object
 */
function updateFieldMappingForObject(objectName, apiType) {
    // Request object metadata
    handleObjectMetadataRequest(objectName, apiType === 'tooling');

    // Listen for metadata to be loaded into state
    const checkMetadata = () => {
        const metadata = getObjectMeta(objectName);
        if (metadata && metadata.fields) {
            // Extract field names from metadata
            const fields = metadata.fields.map(field => ({
                name: field.name,
                label: field.label || field.name,
            }));

            // Add autocomplete suggestions to field mapping inputs
            addFieldSuggestionsToMapping(fields);
        } else {
            // Retry after a short delay if metadata not yet loaded
            setTimeout(checkMetadata, 100);
        }
    };

    // Start checking with a small delay to allow message to be processed
    setTimeout(checkMetadata, 50);
}

/**
 * Add field suggestions to mapping inputs
 */
function addFieldSuggestionsToMapping(fields) {
    const mappingInputs = document.querySelectorAll('.field-mapping-input');

    mappingInputs.forEach(input => {

        // get input container
        let wrapper = input.parentElement;

        // Remove old suggestions container (if any)
        let suggestionsContainer = wrapper.querySelector('.autocomplete-suggestions');
        if (suggestionsContainer) suggestionsContainer.remove();

        suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'autocomplete-suggestions';
        suggestionsContainer.style.display = 'none';
        wrapper.appendChild(suggestionsContainer);


        // Click selection using event delegation
        suggestionsContainer.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.autocomplete-item');
            if (!item) return;

            e.preventDefault();
            input.value = item.dataset.name;
            suggestionsContainer.style.display = 'none';

            input.dispatchEvent(new Event('change'));
        });


        // DEBOUNCED filter logic
        let lastRenderedHTML = "";

        const runFilter = () => {
            const value = input.value.toLowerCase().trim();

            if (!value) {
                suggestionsContainer.style.display = 'none';
                return;
            }

            // Filter fields
            const filtered = fields.filter(f =>
                f.name.toLowerCase().includes(value) ||
                (f.label && f.label.toLowerCase().includes(value))
            ).slice(0, 8);

            if (filtered.length === 0) {
                suggestionsContainer.style.display = 'none';
                return;
            }

            // Build HTML
            const newHTML = filtered.map(f =>
                `<div class="autocomplete-item" data-name="${f.name}">
                    <strong>${f.label}</strong>
                    <span style="opacity: 0.6;">(${f.name})</span>
                </div>`
            ).join('');

            // Only write DOM if changed
            if (newHTML !== lastRenderedHTML) {
                suggestionsContainer.innerHTML = newHTML;
                lastRenderedHTML = newHTML;
            }

            suggestionsContainer.style.display = 'block';
        };

        // Apply your debounce helper
        const debouncedFilter = debounce(runFilter, 90);
        input.addEventListener('input', debouncedFilter);


        // Hide on blur (with small delay)
        input.addEventListener('blur', () => {
            setTimeout(() => {
                suggestionsContainer.style.display = 'none';
            }, 200);
        });

    });
}
