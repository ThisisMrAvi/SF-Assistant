import { dom } from "./dom.js";
import { state } from "./state.js";
import { hideSuggestions } from "./suggestions.js";
import { safeUpdateStatus } from "./utils.js";
import { debounce } from "./utils.js";

// Store listeners at module level
const listeners = {
    keydown: debounce((e) => {
        if (e.ctrlKey && e.key === 'Enter' && document.activeElement === dom.queryInput) {
            e.preventDefault();
            runQuery();
        }
    }, 150),
    runQuery: debounce(runQuery, 200),
    stopQuery: toggeleQueryRunningStatus,
    saveQuery: debounce(saveQuery, 200),
    deleteQuery: debounce(deleteSelectedQuery, 200),
    toolingChange: handleToolingApiChange,
    savedQueryChange: (e) => {
        const v = e.target.value;
        if (v) {
            dom.queryInput.value = v;
            safeUpdateStatus('Loaded saved query', 'green');
        }
    },
    recentQueryChange: (e) => {
        const v = e.target.value;
        if (v) {
            dom.queryInput.value = v;
            safeUpdateStatus('Loaded recent query', 'green');
        }
    }
};

export function initQueryActions() {
    // Global keyboard shortcut
    document.addEventListener('keydown', listeners.keydown);

    // Button handlers
    dom.runQueryBtn?.addEventListener('click', listeners.runQuery);
    dom.stopQueryBtn?.addEventListener('click', listeners.stopQuery);
    dom.saveQueryBtn?.addEventListener('click', listeners.saveQuery);
    dom.deleteQueryBtn?.addEventListener('click', listeners.deleteQuery);

    // Tooling API checkbox
    if (dom.toolingInput) {
        dom.toolingInput.checked = state.isTooling;
        dom.toolingInput.addEventListener('change', listeners.toolingChange);
    }

    // Saved queries dropdown
    dom.savedQueriesDropdown?.addEventListener('change', listeners.savedQueryChange);

    // Recent queries dropdown
    dom.recentQueriesDropdown?.addEventListener('change', listeners.recentQueryChange);
}

// -------------------------
// Action Handlers
// -------------------------
function runQuery() {
    const q = dom.queryInput.value.trim();
    if (!q) {
        if (dom.queryError) dom.queryError.textContent = 'Query cannot be empty';
        safeUpdateStatus('⚠ Query cannot be empty', 'red');
        return;
    }
    if (dom.queryError) dom.queryError.textContent = '';
    // Throttle suggestion hiding to avoid blocking main thread
    requestAnimationFrame(hideSuggestions);
    safeUpdateStatus('Running query...');
    toggeleQueryRunningStatus();
    // Send query asynchronously
    state.vscode.postMessage({ command: 'runQuery', query: q, isTooling: state.isTooling });
}

export function toggeleQueryRunningStatus(event) {
    if (state.isRunning && event) {
        safeUpdateStatus('Query stopped', 'orange');
    }
    state.isRunning = !state.isRunning;
    dom.runQueryBtn.disabled = state.isRunning;
    dom.stopQueryBtn.disabled = !state.isRunning;

}

function saveQuery() {
    const label = dom.saveLabelInput.value.trim();
    const query = dom.queryInput.value.trim();
    if (!label) {
        if (dom.labelError) {
            dom.labelError.textContent = 'Label is required';
            dom.labelError.classList.remove('hidden');
        }
        safeUpdateStatus('⚠ Label is required', 'red');
        return;
    }
    if (!query) {
        if (dom.queryError) {
            dom.queryError.textContent = 'Query is required';
            dom.queryError.classList.remove('hidden');
        }
        safeUpdateStatus('⚠ Query is required', 'red');
        return;
    }

    state.vscode.postMessage({ command: 'saveQuery', label, query });
    safeUpdateStatus(`Saved query "${label}"`, 'green');
    dom.saveLabelInput.value = '';
    dom.queryError.classList.add('hidden');
    dom.labelError.classList.add('hidden');
}

function deleteSelectedQuery() {
    const sel = dom.savedQueriesDropdown.selectedIndex;
    if (!dom.savedQueriesDropdown || sel <= 0) {
        safeUpdateStatus('⚠ No saved query selected', 'red');
        return;
    }
    const label = dom.savedQueriesDropdown.options[sel].text;
    state.vscode.postMessage({ command: 'deleteQuery', label });
    safeUpdateStatus(`Deleted query "${label}"`, 'green');
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


export function populateQueries(list, listType) {
    const targets = {
        Saved: dom.savedQueriesDropdown,
        Recent: dom.recentQueriesDropdown
    };

    const target = targets[listType];
    if (!target) return;

    // Clear & add default option safely
    target.replaceChildren(new Option(`-- Select ${listType} Query --`, ""));

    const fragment = document.createDocumentFragment();

    list.forEach(item => {
        const query = item.query || item;
        const label = item.label || item;

        const opt = new Option(label, query);
        opt.title = query;

        fragment.appendChild(opt);
    });

    target.appendChild(fragment);
}
