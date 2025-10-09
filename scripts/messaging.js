import { state } from "./state.js";
import { dom } from "./dom.js";
import { renderResults } from "./results.js";
import { sendTextUpdateEvent, safeUpdateStatus } from "./utils.js";
import { hideSuggestions, showSuggestions } from "./suggestions.js";
import { injectPage } from "./main.js";
import { viewObjectMeta, renderVirtualList } from "./metaActions.js";
import { populateQueries, toggeleQueryRunningStatus } from "./queryActions.js";

export function initMessaging() {
    window.addEventListener('message', handleExtensionMessage);
}

function handleExtensionMessage(ev) {
    const msg = ev.data;
    console.log('received message : ' + msg.command);

    try {
        switch (msg.command) {
            case 'injectPage':
                injectPage(msg.pageName, msg.html);
                break;
            case 'orgInfo':
                console.log('Received org info');
                state.orgInfo = msg.orgInfo;
                break;
            case 'showResult':
                if (state.isRunning) {
                    safeUpdateStatus(`✅ ${msg.rowCount} records in ${msg.time}s`, 'green');
                    renderResults(msg.data);
                    toggeleQueryRunningStatus();
                }
                break;
            case 'savedQueries':
                populateQueries(msg.queries || [], "Saved");
                break;
            case 'restoreState':
                populateQueries(msg.queries || [], "Recent");
                if (msg.queries && msg.queries.length) {
                    dom.queryInput.value = msg.queries[0];
                    sendTextUpdateEvent(dom.queryInput);
                }
                dom.toolingInput.checked = msg.isTooling;
                state.isTooling = msg.isTooling;
                break;
            case 'recentQueries':
                populateQueries(msg.queries || [], "Recent");
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
            case 'error':
                safeUpdateStatus(`❌ ${msg.message}`, 'red');
                hideSuggestions();
                break;
            case 'iconMap':
                console.log('Received icon data');
                state.iconMap = msg.iconMap || {};
                break;
            default:
                console.log(`Unknown command from extension: ${msg.command}`);
        }
    } catch (err) {
        console.error('Error in messaging service: ' + err);
    }
}
