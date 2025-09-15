import { state } from "./state.js";
import { dom } from "./dom.js";
import { renderResults } from "./results.js";
import { sendTextUpdateEvent, updateStatus } from "./utils.js";
import { hideSuggestions, showSuggestions } from "./suggestions.js";
import { injectPage } from "./main.js";
import { viewObjectMeta, renderVirtualList } from "./metaActions.js";

export function initMessaging() {
    window.addEventListener('message', (ev) => {
        const msg = ev.data;
        switch (msg.command) {
            case 'injectPage':
                injectPage(msg.pageName, msg.html);
                break;
            case 'orgInfo':
                console.log('Received org info');
                state.orgInfo = msg.orgInfo;
                break;
            case 'showResult':
                renderResults(msg.data);
                break;
            case 'savedQueries':
                populateSavedQueries(msg.queries || []);
                break;
            case 'restoreState':
                if (msg.query) {
                    dom.queryInput.value = msg.query;
                    dom.toolingInput.checked = msg.isTooling;
                    state.isTooling = msg.isTooling;
                    sendTextUpdateEvent(dom.queryInput);
                }
                break;
            case 'objectsList':
                state.objectsList = msg.objects;
                if (state.pageName === 'soql-panel' && state.suggestionVisible) {
                    showSuggestions(state.token, 'object');
                } else if (state.pageName === 'meta-explorer') {
                    renderVirtualList();
                }
                break;
            case 'toolingObjectsList':
                state.toolingObjectsList = msg.objects;
                if (state.pageName === 'soql-panel' && state.suggestionVisible) {
                    showSuggestions(state.token, 'object');
                } else if (state.pageName === 'meta-explorer') {
                    renderVirtualList();
                }
                break;
            case 'objectMeta':
                if (msg.objMeta && msg.objMeta.name) {
                    state.objectMeta[msg.objMeta.name] = msg.objMeta;
                }
                if (state.pageName === 'soql-panel' && state.suggestionVisible) {
                    showSuggestions(state.token, 'field');
                } else if (state.pageName === 'meta-explorer') {
                    viewObjectMeta(msg.objMeta.name);
                }
                break;
            case 'executionFeedback':
                updateStatus(`✅ ${msg.rowCount} records in ${msg.time}s`, 'green');
                break;
            case 'error':
                updateStatus(`❌ ${msg.message}`, 'red');
                hideSuggestions();
                break;
            case 'iconMap':
                console.log('Received icon data');
                state.iconMap = msg.iconMap || {};
                break;
            default:
                console.log(`Unknown command from extension: ${msg.command}`);
        }
    });
}

function populateSavedQueries(list) {
    if (!dom.savedQueriesDropdown) {
        return;
    }
    dom.savedQueriesDropdown.innerHTML = '<option value="">-- Select Saved Query --</option>';
    list.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.query;
        opt.textContent = item.label;
        opt.title = item.query;
        dom.savedQueriesDropdown.appendChild(opt);
    });
}