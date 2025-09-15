import { dom } from "./dom.js";
import { state } from "./state.js";
import { hideSuggestions } from "./suggestions.js";
import { updateStatus } from "./utils.js";

export function initQueryActions() {
    // keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            dom.runQueryBtn?.click();
        }
    });
    if (dom.runQueryBtn) dom.runQueryBtn.addEventListener('click', runQuery);
    if (dom.saveQueryBtn) dom.saveQueryBtn.addEventListener('click', saveQuery);
    if (dom.deleteQueryBtn) dom.deleteQueryBtn.addEventListener('click', deleteSelectedQuery);
    if (dom.toolingInput) {
        dom.toolingInput.checked = state.isTooling;
        dom.toolingInput.addEventListener('change', handleToolingApiChange);
    }

    if (dom.savedQueriesDropdown) {
        try {
            dom.savedQueriesDropdown.addEventListener('change', (e) => {
                const v = e.target.value;
                if (v) {
                    dom.queryInput.value = v;
                    updateStatus('Loaded saved query', 'green');
                }
            });
        } catch (err) {
            console.log(err);
        }
    }
}

function runQuery() {
    const q = dom.queryInput.value.trim();
    if (!q) {
        if (dom.queryError) dom.queryError.textContent = 'Query cannot be empty';
        updateStatus('⚠ Query cannot be empty', 'red');
        return;
    }
    if (dom.queryError) dom.queryError.textContent = '';
    hideSuggestions();
    updateStatus('Running query...');
    state.vscode.postMessage({ command: 'runQuery', query: q, isTooling: state.isTooling });
}

function saveQuery() {
    const label = dom.saveLabelInput.value.trim();
    const query = dom.queryInput.value.trim();
    if (!label) {
        if (dom.labelError) {
            dom.labelError.textContent = 'Label is required';
            dom.labelError.classList.remove('hidden');
        }
        updateStatus('⚠ Label is required', 'red');
        return;
    }
    if (!query) {
        if (dom.queryError) {
            dom.queryError.textContent = 'Query is required';
            dom.queryError.classList.remove('hidden');
        }
        updateStatus('⚠ Query is required', 'red');
        return;
    }
    state.vscode.postMessage({ command: 'saveQuery', label, query });
    updateStatus(`Saved query "${label}"`, 'green');
    dom.saveLabelInput.value = '';
    dom.queryError.classList.add('hidden');
    dom.labelError.classList.add('hidden');
}

function deleteSelectedQuery() {
    const sel = dom.savedQueriesDropdown.selectedIndex;
    if (!dom.savedQueriesDropdown || sel <= 0) {
        updateStatus('⚠ No saved query selected', 'red');
        return;
    }
    const label = dom.savedQueriesDropdown.options[sel].text;
    state.vscode.postMessage({ command: 'deleteQuery', label });
    updateStatus(`Deleted query "${label}"`, 'green');
}

function handleToolingApiChange() {
    state.isTooling = dom.toolingInput.checked;
    const objReq = state.isTooling ? 'requestToolingObjectList' : 'requestObjectList';
    state.vscode.postMessage({
        command: objReq,
        objectType: state.currentObject,
        isTooling: state.isTooling,
    });
}