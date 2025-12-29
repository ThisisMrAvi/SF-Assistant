import { dom } from "./dom.js";
import { showNotification } from "./main.js";
import { state, toggleToolingMode } from "./state.js";
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
            showNotification('Loaded saved query', 'success');
        }
    },
    recentQueryChange: (e) => {
        const v = e.target.value;
        if (v) {
            dom.queryInput.value = v;
            showNotification('Loaded recent query', 'success');
        }
    }
};

export function initQueryActions() {
    if (!dom.queryInput) {
        console.warn('Query input not found in DOM');
        // initialize after a short delay in case DOM is not ready yet
        setTimeout(initQueryActions, 2000);
        return;
    }

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
    safeUpdateStatus('Running query...', 'black');
    toggeleQueryRunningStatus();
    // Send query asynchronously
    state.vscode.postMessage({ command: 'runQuery', query: q, isTooling: state.isTooling });
}

export function toggeleQueryRunningStatus(event) {
    if (state.loading.query && event) {
        safeUpdateStatus('Query stopped', 'orange');
    }
    state.loading.query = !state.loading.query;
    dom.runQueryBtn.disabled = state.loading.query;
    dom.stopQueryBtn.disabled = !state.loading.query;
    if (dom.resultDiv) {
        dom.resultDiv.classList.toggle('blurred', state.loading.query);
    }
}

function saveQuery() {
    const label = dom.saveLabelInput.value.trim();
    const query = dom.queryInput.value.trim();
    if (!label) {
        if (dom.labelError) {
            dom.labelError.textContent = 'Label is required';
            dom.labelError.classList.remove('hidden');
        }
        showNotification('⚠ Label is required', 'error');
        return;
    }
    if (!query) {
        if (dom.queryError) {
            dom.queryError.textContent = 'Query is required';
            dom.queryError.classList.remove('hidden');
        }
        showNotification('⚠ Query is required', 'error');
        return;
    }

    state.vscode.postMessage({ command: 'saveQuery', label, query });
    showNotification(`Saved query "${label}"`, 'success');
    dom.saveLabelInput.value = '';
    dom.queryError.classList.add('hidden');
    dom.labelError.classList.add('hidden');
}

function deleteSelectedQuery() {
    const sel = dom.savedQueriesDropdown.selectedIndex;
    if (!dom.savedQueriesDropdown || sel <= 0) {
        showNotification('⚠ No saved query selected', 'error');
        return;
    }
    const label = dom.savedQueriesDropdown.options[sel].text;
    state.vscode.postMessage({ command: 'deleteQuery', label });
    showNotification(`Deleted query "${label}"`, 'success');
}

function handleToolingApiChange() {
    toggleToolingMode(dom.toolingInput.checked);
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
