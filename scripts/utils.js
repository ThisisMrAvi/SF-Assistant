import { dom } from "./dom.js";
import { state } from './state.js';

export function sendTextUpdateEvent(elm = dom.queryInput) {
    const inputEvent = new Event('input', { bubbles: true });
    elm.dispatchEvent(inputEvent);
}

export function updateStatus(msg, color = 'green') {
    if (dom.statusBar) {
        dom.statusBar.style.display = 'block';
        dom.statusBar.style.color = color;
        dom.statusBar.textContent = msg;
    }
}

export function updateSelectedSuggestion(suggestionsDiv) {
    Array.from(suggestionsDiv.children).forEach((child, i) => {
        child.classList.toggle('selected', i === state.selectedSuggestionIndex);
    });
}

// Simple debounce helper
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

export function fetchObjectMetadataIfNeeded(objectName) {
    if (!objectName) return;
    if (!state.objectMeta[objectName]) {
        state.vscode.postMessage({
            command: 'requestObjectMeta',
            objectType: objectName,
            isTooling: state.isTooling
        });
    }
}

export function validObjectName(objectName) {
    if (!objectName) return false;
    const currObjList = state.isTooling ? state.toolingObjectsList : state.objectsList;
    const objExist = currObjList.find(obj => (obj.name || '').toLowerCase() === objectName.toLowerCase());
    return objExist;
}

export function handleCopy(event, textToCopy) {
    const btn = event.currentTarget;
    navigator.clipboard.writeText(textToCopy).then(() => {
        btn.classList.add('copied');
        setTimeout(() => (btn.classList.remove('copied')), 3000);
    });
}

