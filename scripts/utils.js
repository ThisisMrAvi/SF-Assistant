import { dom } from "./dom.js";
import { state } from './state.js';

export function sendTextUpdateEvent(elm = dom.queryInput) {
    const inputEvent = new Event('input', { bubbles: true });
    elm.dispatchEvent(inputEvent);
}

// Throttle DOM updates using requestAnimationFrame
export function safeUpdateStatus(msg, color) {
    if (!dom.statusBar) return;
    if (dom.statusBar.textContent === msg) return;
    requestAnimationFrame(() => {
        dom.statusBar.style.display = 'block';
        dom.statusBar.style.color = color;
        dom.statusBar.textContent = msg;
    });
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

// Store timeouts in a WeakMap to avoid adding properties to DOM elements
const copyTimeouts = new WeakMap();
const COPY_FEEDBACK_DURATION = 3000;

export async function handleCopy(btn, textToCopy, duration = COPY_FEEDBACK_DURATION) {
    if (!btn) {
        return;
    }

    // Cache icon element
    const iconSpan = btn.querySelector('.icon');

    // Clean up any existing timeout
    const existingTimeout = copyTimeouts.get(btn);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        if (iconSpan) {
            iconSpan.classList.remove('icon-copied');
            iconSpan.classList.add('icon-copy');
        }
    }

    try {
        // Attempt to copy text
        await navigator.clipboard.writeText(textToCopy);
        if (iconSpan) {
            iconSpan.classList.remove('icon-copy');
            iconSpan.classList.add('icon-copied');
        }
        safeUpdateStatus('Copied to clipboard', 'green');

        // Set up automatic reset
        const timeoutId = setTimeout(() => {
            if (iconSpan) {
                iconSpan.classList.remove('icon-copied');
                iconSpan.classList.add('icon-copy');
            }
            copyTimeouts.delete(btn);
        }, duration);

        copyTimeouts.set(btn, timeoutId);
    } catch (error) {
        console.error('Copy failed:', error);
        safeUpdateStatus('Failed to copy to clipboard', 'red');
    }
}