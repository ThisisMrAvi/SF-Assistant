import { state, operatorSuggestions, dateLiterals, handleObjectListRequest, handleObjectMetadataRequest, getObjectList, getObjectMeta } from "./state.js";
import { dom } from "./dom.js";
import { sendTextUpdateEvent, debounce, validObjectName } from "./utils.js";

// ------------------------
// Config
// ------------------------
const MAX_SUGGESTIONS = 50;

// Store listeners at module level
const listeners = {
    input: debounce(handleQueryInput, 300),
    keydown: handleQueryKeyDown
};

// Cache for suggestion elements (optimizes setSelected to O(1))
let suggestionElements = [];

// Debounced focus handler to reduce DOM query frequency
const debouncedSetSelected = debounce(setSelected, 50);

// Delegated event listener for suggestions
function handleSuggestionClick(ev) {
    const suggestionElm = ev.target.closest('.suggestion-item');
    if (suggestionElm && suggestionElm.dataset.value) {
        ev.preventDefault();
        insertSuggestion(suggestionElm.dataset.value);
    }
}

function handleSuggestionKeyDown(ev) {
    if (ev.key !== 'Enter') {
        return;
    }
    const suggestionElm = ev.target.closest('.suggestion-item');
    if (!suggestionElm || !suggestionElm.dataset.value) {
        return;
    }
    if (ev.ctrlKey || ev.shiftKey || ev.altKey || ev.metaKey) {
        return;
    }
    ev.preventDefault();
    insertSuggestion(suggestionElm.dataset.value);
}

function handleSuggestionFocus(ev) {
    const suggestionElm = ev.target.closest('.suggestion-item');
    if (!suggestionElm) {
        return;
    }
    const idx = suggestionElements.indexOf(suggestionElm);
    if (idx >= 0) {
        debouncedSetSelected(idx);
    }
}

// ------------------------
// Initialization
// ------------------------
export function initSuggestions() {
    dom.queryInput?.addEventListener('input', listeners.input);
    dom.queryInput?.addEventListener('keydown', listeners.keydown);

    // Attach delegated listeners to suggestions container
    dom.suggestionItems?.addEventListener('click', handleSuggestionClick);
    dom.suggestionItems?.addEventListener('keydown', handleSuggestionKeyDown);
    dom.suggestionItems?.addEventListener('focus', handleSuggestionFocus, true);
}

// ------------------------
// Suggestion Display
// ------------------------
export function showSuggestions(token, type, field) {
    try {
        dom.suggestionsContainer.style.display = "block";
        dom.suggestionItems.innerHTML = "";
        const frag = document.createDocumentFragment();
        let list = [];

        switch (type) {
            case "field":
                if (!state.currentObject) {
                    return;
                }
                dom.suggestionsTitle.textContent = `${state.currentObject} Field Suggestions:`;
                const meta = getObjectMeta(state.currentObject);
                if (!meta) {
                    handleObjectMetadataRequest(state.currentObject);
                    showLoadingText(type);
                    return;
                }
                list = meta.fields;
                break;

            case "object":
                dom.suggestionsTitle.textContent = "Object Suggestions:";
                list = getObjectList();

                // If object list is empty and not already loading, request it
                if ((!list || list.length === 0)) {
                    handleObjectListRequest();
                }
                break;

            case "operator":
                dom.suggestionsTitle.textContent = `Operator Suggestions for ${field?.name || "field"}:`;
                list = operatorSuggestions[field.type] || [];
                break;

            case "value":
                dom.suggestionsTitle.textContent = `Value Suggestions for ${field?.name || "field"}:`;

                if (field?.type === "picklist") {
                    list = (field.picklistValues || [])
                        .filter(v => v.active)
                        .map(item => ({ label: `'${item.label}'`, name: `'${item.value}'` }));
                } else if (field?.type === "date" || field?.type === "datetime") {
                    list = dateLiterals;
                } else {
                    hideSuggestions();
                    return;
                }
                break;

            default:
                break;
        }

        if (!list || !list.length) {
            showLoadingText(type);
            return;
        }

        // Precompute lowercase for filtering
        if (!list._lc) {
            list._lc = list.map(item =>
                typeof item === "string" ? item.toLowerCase() : (item.name || item.value || item.label || "").toLowerCase()
            );
        }

        const tokenLC = token.toLowerCase();
        const filtered = list
            .map((s, idx) => ({ item: s, lc: list._lc[idx] }))
            .filter(obj => obj.lc.includes(tokenLC))
            .slice(0, MAX_SUGGESTIONS)
            .map(obj => obj.item);

        if (!filtered.length) {
            hideSuggestions();
            return;
        }

        let suggestionIndex = 0;
        filtered.forEach(item => {
            if (typeof item === "string") {
                // for operators, literals, simple strings
                frag.appendChild(createSuggestionElm(suggestionIndex++, type, item, item, null));
            } else {
                // object/field style
                if (type === "field" && item.type === "reference" && item.relationshipName) {
                    frag.appendChild(createSuggestionElm(suggestionIndex++, type, item.relationshipName + ".", item.relationshipName, item.type));
                }
                frag.appendChild(createSuggestionElm(suggestionIndex++, type, item.name, item.label || item.name, item.type));
            }
        });

        requestAnimationFrame(() => {
            dom.suggestionItems.innerHTML = "";
            dom.suggestionItems.appendChild(frag);
            dom.suggestionItems.style.display = "flex";

            // Cache suggestion elements for O(1) setSelected() lookups
            suggestionElements = Array.from(dom.suggestionItems.getElementsByClassName('suggestion-item'));

            state.suggestionVisible = true;
            state.selectedSuggestionIndex = 0;
        });
    } catch (err) {
        console.error('showSuggestions error: ' + (err && err.message ? err.message : String(err)));
        hideSuggestions();
    }
}

function showLoadingText(type) {
    dom.suggestionItems.innerHTML = `<div class="suggestion-item loading">${type === 'field' ? 'Loading fields...' : 'Loading objects...'
        }</div>`;
    dom.suggestionItems.style.display = 'flex';
    state.suggestionVisible = true;
    state.selectedSuggestionIndex = -1;
}

function createSuggestionElm(idx, type, itemName, itemLabel, itemType) {
    const div = document.createElement('div');
    div.className = `suggestion-item ${type}-suggestion`;
    div.tabIndex = 0;
    div.dataset.value = itemName;
    div.title = itemLabel || itemName;

    if (state.iconMap?.[itemType]) {
        const iconImg = document.createElement('img');
        iconImg.src = state.iconMap[itemType];
        iconImg.className = 'suggestion-icon';
        div.appendChild(iconImg);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'suggestion-label';
    labelSpan.textContent = itemName;
    div.appendChild(labelSpan);

    return div;
}

function setSelected(idx) {
    if (!suggestionElements.length) {
        return;
    }
    suggestionElements.forEach(it => it.classList.remove('selected'));
    state.selectedSuggestionIndex = Math.max(0, Math.min(idx, suggestionElements.length - 1));
    suggestionElements[state.selectedSuggestionIndex]?.classList.add('selected');
}

function insertSuggestion(suggestion) {
    const cursorPos = dom.queryInput.selectionStart;
    const textBefore = dom.queryInput.value.substring(0, cursorPos);
    const textAfter = dom.queryInput.value.substring(cursorPos);

    const startsWithSelect = /^select\s+/i.test(textBefore);
    const match = textBefore.match(/([A-Za-z0-9_.]*?)([A-Za-z0-9_]*)$/);
    const currentToken = match ? match[2] : '';
    const start = cursorPos - currentToken.length;

    // If suggestion ends with dot, it's a relationship
    const isRelationshipPrefix = suggestion.endsWith('.');
    const isBeforeFrom = dom.queryInput.value.toLowerCase().indexOf('from') > cursorPos;
    const shouldAddComma = startsWithSelect && isBeforeFrom &&
        !isRelationshipPrefix &&
        !textAfter.trimStart().startsWith(',');

    const insertValue = suggestion + (shouldAddComma ? ', ' : '');
    dom.queryInput.setRangeText(insertValue, start, cursorPos, 'end');
    dom.queryInput.focus();
    dom.queryInput.setSelectionRange(start + insertValue.length, start + insertValue.length);
    requestAnimationFrame(() => sendTextUpdateEvent());
}

export function hideSuggestions() {
    state.suggestionVisible = false;
    if (dom.suggestionsContainer) {
        dom.suggestionsContainer.style.display = 'none';
    }
    if (dom.suggestionItems) {
        dom.suggestionItems.innerHTML = '';
    }
    suggestionElements = [];
    state.selectedSuggestionIndex = -1;
}

// ------------------------
// Input Handler
// ------------------------
function handleQueryKeyDown(e) {
    dom.statusBar.style.display = 'none';
    if (!state.suggestionVisible) return;

    const items = Array.from(dom.suggestionItems.getElementsByClassName('suggestion-item'));
    if (!items.length) return;

    if (e.key === 'Tab') {
        e.preventDefault();
        setSelected(state.selectedSuggestionIndex);
        items[state.selectedSuggestionIndex].focus();
    }
    if (e.ctrlKey && e.key === ' ') {
        if (state.objectMeta && state.currentObject && state.objectMeta[state.currentObject]) {
            e.preventDefault();
            const token = (state.token || '').toLowerCase();
            const allFields = state.objectMeta[state.currentObject]?.fields
                ?.filter(field => field.name.toLowerCase().includes(token))
                .map(field => field.name)
                .join(', ');
            insertSuggestion(allFields);
        }
    }
    if (e.key === 'Escape') {
        hideSuggestions();
    }
}

// Get current FROM object
export function getActiveFromInfo(full, pos) {
    const matches = [];
    const stack = []; // track open parenthesis indexes
    let depth = 0;

    const length = full.length;
    let i = 0;

    while (i < length) {
        const ch = full[i];

        if (ch === "(") {
            stack.push(i);
            depth++;
            i++;
            continue;
        }
        if (ch === ")") {
            stack.pop();
            depth = Math.max(0, depth - 1);
            i++;
            continue;
        }

        // detect FROM keyword
        if ((ch === "F" || ch === "f") && full.slice(i, i + 4).toUpperCase() === "FROM") {
            const before = i === 0 ? " " : full[i - 1];
            const after = full[i + 4] || " ";
            if (/\W/.test(before) && /\s/.test(after)) {
                const match = /\bFROM\s+([A-Za-z0-9_]+)/i.exec(full.slice(i));
                if (match) {
                    matches.push({
                        name: match[1],
                        index: i,
                        depth,
                        openIndex: stack.length ? stack[stack.length - 1] : null,
                    });
                }
            }
        }

        i++;
    }

    // find depth at cursor
    let currDepth = 0;
    for (let j = 0; j < pos; j++) {
        if (full[j] === "(") currDepth++;
        else if (full[j] === ")") currDepth = Math.max(0, currDepth - 1);
    }

    // find active FROM at this depth
    let active = null;
    for (let k = matches.length - 1; k >= 0; k--) {
        if (matches[k].depth === currDepth && matches[k].index <= pos) {
            active = matches[k];
            break;
        }
    }
    if (!active) {
        active = matches.find((fm) => fm.depth === currDepth && fm.index > pos) || null;
    }

    // find parent FROM at depth - 1
    let parent = null;
    if (currDepth > 0 && active?.openIndex !== null) {
        for (let k = matches.length - 1; k >= 0; k--) {
            if (matches[k].depth === currDepth - 1) {
                parent = matches[k];
                break;
            }
        }
    }

    return {
        depth: currDepth,
        name: active?.name || null,
        parentName: parent?.name || null,
        matches,
    };
}



/* ----------------------------
   Main Query input handler
   ---------------------------- */
function handleQueryInput(e) {
    state.selectedSuggestionIndex = 0;
    const q = dom.queryInput.value;
    const cursorPos = dom.queryInput.selectionStart;
    const before = q.substring(0, cursorPos);

    const showObjectSuggestions = () => {
        const match = before.match(/\bfrom\s+([\w]*)$/i);
        state.token = match ? match[1] : '';
        showSuggestions(state.token, 'object');
    };

    // FROM clause while typing → object or child relationship suggestions (cursor-aware)
    const info = getActiveFromInfo(q, cursorPos);

    let resolvedObject = null;

    if (info.name) {
        if (info.depth === 0) {
            resolvedObject = info.name;
        } else {
            const parentName = info.parentName || state.currentObject;
            const parentMeta = state.objectMeta[parentName];

            if (parentMeta) {
                const childRels = parentMeta.childRelationships || [];
                const candidate = info.name.toLowerCase();
                const match = childRels.find(cr => {
                    return (cr.relationshipName || '').toLowerCase() === candidate;
                });

                resolvedObject = match?.childSObject || match?.childObject || info.name;
            } else {
                resolvedObject = info.name;
            }
        }
    }

    // No FROM object found — suggest objects
    if (!resolvedObject) {
        state.currentObject = null;
        showObjectSuggestions();
        return;
    }

    // Check if User is done with typing objectname
    const objFinalized = /\bfrom\s+\w+\s+/i.test(before);
    if (before.toLowerCase().includes('from') && !objFinalized) {
        state.currentObject = null;
        showObjectSuggestions();
        return;
    }

    // Validate object and fetch metadata
    const validObj = validObjectName(resolvedObject);
    if (!validObj) {
        state.currentObject = null;
        showObjectSuggestions();
        return;
    }
    state.currentObject = validObj.name;
    handleObjectMetadataRequest(validObj.name);

    if (info.parentName && info.parentName !== validObj.name) {
        handleObjectMetadataRequest(info.parentName);
    }

    // Dot notation (relationship) e.g. Account.Owner.
    const dotMatch = before.match(/([\w]+(?:\.[\w]+)*\.?)$/);
    if (dotMatch && dotMatch[1].includes('.')) {
        handleRelatedObj(dotMatch[1].split('.'));
        return;
    }


    // WHERE/AND/OR → operator suggestions
    const whereFieldOnlyMatch =
        before.match(/\b(WHERE)\s+([\w.]+)\s*([\w.]+)*\s+$/i) ||
        before.match(/\b(AND|OR)\s+([\w.]+)\s*([\w.]+)*\s+$/i);

    if (whereFieldOnlyMatch) {
        const fieldName = whereFieldOnlyMatch[2];
        state.token = whereFieldOnlyMatch[3] || '';
        const fields = state.objectMeta[state.currentObject]?.fields || [];
        if (fieldName) {
            const lastSeg = fieldName.split('.').pop();;
            const fieldMeta = fields.find(f => (f.name || '').toLowerCase() === lastSeg.toLowerCase());
            if (fieldMeta) {
                showSuggestions(state.token, 'operator', fieldMeta);
                return;
            }
        }
    }

    // After operator → value suggestions
    const afterOpMatch = before.match(/\b([\w.]+)\s*(=|!=|LIKE|IN|NOT\s+IN|>|<|>=|<=|INCLUDES|EXCLUDES)\s*([\w.]+)*$/i);
    if (afterOpMatch) {
        const fieldName = afterOpMatch[1];
        state.token = afterOpMatch[3] || '';
        const fields = state.objectMeta[state.currentObject]?.fields || [];
        if (fieldName) {
            const lastSeg = fieldName.split('.').slice(-1)[0];
            const fieldMeta = fields.find(f => (f.name || '').toLowerCase() === lastSeg.toLowerCase());
            if (fieldMeta) {
                showSuggestions(state.token, 'value', fieldMeta);
                return;
            }
        }
    }

    // Clause-based field suggestions (SELECT / WHERE / AND / OR / ORDER BY / GROUP BY / HAVING)
    const clauseMatch = /\b(select|where|and|or|order\s+by|group\s+by|having)\s+[^\n]*$/i;
    if (clauseMatch.test(before)) {
        state.token = (before.match(/[\w.]*$/) || [''])[0];
        showSuggestions(state.token, 'field');
    } else {
        hideSuggestions();
    }
}

/* ----------------------------
   Handle related object dot-notation
   ---------------------------- */
function handleRelatedObj(relObjParts) {
    try {
        let currObjFields = [];
        state.token = relObjParts[relObjParts.length - 1];
        for (let index = 0; index < relObjParts.length - 1; index++) {
            const element = relObjParts[index];
            currObjFields = state.objectMeta[state.currentObject]?.fields || [];
            if (currObjFields && currObjFields.length > 0) {
                const relNode = currObjFields.find(item => item.relationshipName === element);
                if (relNode && relNode.referenceTo && relNode.referenceTo.length) {
                    state.currentObject = relNode.referenceTo[0];
                    handleObjectMetadataRequest(state.currentObject);
                }
                showSuggestions(state.token, 'field');
            }
        }
    } catch (err) {
        console.error('handleRelatedObj error: ' + (err && err.message ? err.message : String(err)));
    }

}
