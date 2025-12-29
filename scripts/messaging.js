import { resolveObjectList, resolveObjectMetadata, state } from "./state.js";
import { dom } from "./dom.js";
import { renderResults } from "./results.js";
import { sendTextUpdateEvent, safeUpdateStatus } from "./utils.js";
import { hideSuggestions, showSuggestions } from "./suggestions.js";
import { injectPage, showNotification } from "./main.js";
import { viewObjectMeta, renderVirtualList, handleRecordMetadataMessage } from "./metaActions.js";
import { populateQueries, toggeleQueryRunningStatus } from "./queryActions.js";
import { handleDataLoadProgress, handleDataLoadResult } from "./dataImportActions.js";

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
                showNotification(`Org info received for ${msg.orgInfo.alias}`, 'success');
                break;
            case 'showResult':
                if (state.loading.query) {
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
                if (dom.queryInput && msg.queries && msg.queries.length) {
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
                resolveObjectList(false, msg.objects);
                showNotification(`Received objects list`, 'success');
                if (state.pageName === 'data-export' && state.suggestionVisible) {
                    showSuggestions(state.token, 'object');
                } else if (state.pageName === 'meta-explorer') {
                    renderVirtualList();
                }
                break;
            case 'toolingObjectsList':
                resolveObjectList(true, msg.objects);
                showNotification(`Received tooling objects list`, 'success');
                if (state.pageName === 'data-export' && state.suggestionVisible) {
                    showSuggestions(state.token, 'object');
                } else if (state.pageName === 'meta-explorer') {
                    renderVirtualList();
                }
                break;
            case 'objectMeta':
                resolveObjectMetadata(msg.objMeta.name, msg.objMeta);
                if (state.pageName === 'data-export' && state.suggestionVisible) {
                    showSuggestions(state.token, 'field');
                } else if (state.pageName === 'meta-explorer') {
                    viewObjectMeta(msg.objMeta.name);
                }
                break;
            case 'recordMeta':
                if (state.pageName === 'meta-explorer') {
                    handleRecordMetadataMessage(msg.recordData);
                }
                break;
            case 'error':
                if (state.pageName === 'data-export') {
                    // On SOQL panel, update status bar and hide suggestions
                    if (state.loading.query) {
                        safeUpdateStatus(`❌ ${msg.message}`, 'red');
                        toggeleQueryRunningStatus();
                    }
                    hideSuggestions();
                } else {
                    showNotification(`Error: ${msg.message}`, 'error');
                }
                break;
            case 'exportError':
                if (state.pageName === 'data-export') {
                    // On SOQL panel, update status bar with appropriate icon/color based on status type
                    if (state.loading.query) {
                        let errMsg = msg.cause?.message ?? msg.message;
                        safeUpdateStatus(errMsg, 'red');
                        toggeleQueryRunningStatus();
                    }
                    hideSuggestions();
                }
                break;
            case 'iconMap':
                console.log('Received icon data');
                state.iconMap = msg.iconMap || {};
                break;
            case 'dataLoadProgress':
                handleDataLoadProgress(msg.progress);
                break;
            case 'dataLoadResult':
                handleDataLoadResult(msg.summary);
                break;
            default:
                console.log(`Unknown command from extension: ${msg.command}`);
        }
    } catch (err) {
        console.error('Error in messaging service: ' + err);
    }
}
