import { state, operatorSuggestions, dateLiterals } from "./state.js";
import { dom } from "./dom.js";
import { sendTextUpdateEvent, debounce, fetchObjectMetadataIfNeeded, validObjectName } from "./utils.js";

export function initSuggestions() {
    dom.queryInput.addEventListener('input', debounce(handleQueryInput, 500));
    dom.queryInput.addEventListener('keydown', handleQueryKeyDown);
}

export function showSuggestions(token, type, field) {
    try {
        dom.suggestionsContainer.style.display = "block";
        dom.suggestionItems.innerHTML = "";
        const frag = document.createDocumentFragment();
        let list = [];

        switch (type) {
            case "field": {
                if (!state.currentObject) {
                    return;
                }
                dom.suggestionsTitle.textContent = `${state.currentObject} Field Suggestions:`;
                if (!state.objectMeta[state.currentObject]) {
                    state.vscode.postMessage({
                        command: "requestObjectMeta",
                        objectType: state.currentObject,
                        isTooling: state.isTooling
                    });
                } else {
                    list = state.objectMeta[state.currentObject].fields;
                }
                break;
            }

            case "object": {
                dom.suggestionsTitle.textContent = "Object Suggestions:";
                list = state.isTooling ? state.toolingObjectsList : state.objectsList;
                break;
            }

            case "operator": {
                dom.suggestionsTitle.textContent = `Operator Suggestions for ${field?.name || "field"}:`;
                list = operatorSuggestions[field.type];
                break;
            }

            case "value": {
                dom.suggestionsTitle.textContent = `Value Suggestions for ${field?.name || "field"}:`;

                if (field?.type === "picklist") {
                    const activeValues = field.picklistValues?.filter(el => el.active) || [];
                    list = activeValues.map(item => ({
                        label: `'${item.label}'`,
                        name: `'${item.value}'`
                    }));
                } else if (field?.type === "date" || field?.type === "datetime") {
                    list = dateLiterals;
                } else {
                    hideSuggestions();
                    return;
                }
                break;
            }

            default:
                dom.suggestionsTitle.textContent = "Suggestions:";
                break;
        }

        if (!list || list.length === 0) {
            showLoadingText(type);
            return;
        }

        // normalize + filter
        const tokenLowerCase = token.toLowerCase()
        const filtered = list.filter((s) => {
            if (typeof s === "string") {
                return s.toLowerCase().includes(tokenLowerCase);
            }
            return (s.name || s.value || s.label || "")
                .toLowerCase()
                .includes(tokenLowerCase);
        });

        if (!filtered.length) {
            hideSuggestions();
            return;
        }

        let suggestionIndex = 0;
        filtered.forEach((item) => {
            let elm;
            if (typeof item === "string") {
                // for operators, literals, simple strings
                elm = createSuggestionElm(suggestionIndex++, type, item, item, null);
            } else {
                // object/field style
                if (type === "field" && item.type === "reference" && item.relationshipName) {
                    const relElm = createSuggestionElm(
                        suggestionIndex++,
                        type,
                        item.relationshipName + ".",
                        item.relationshipName,
                        item.type
                    );
                    frag.appendChild(relElm);
                }
                elm = createSuggestionElm(
                    suggestionIndex++,
                    type,
                    item.name,
                    item.label || item.name,
                    item.type
                );
            }
            frag.appendChild(elm);
        });

        dom.suggestionItems.appendChild(frag);
        dom.suggestionItems.style.display = "flex";
        state.suggestionVisible = true;
    } catch (err) {
        console.error('showSuggestions error: ' + (err && err.message ? err.message : String(err)));
        hideSuggestions();
    }
}

function showLoadingText(type) {
    const loadingText = type === 'field' ? 'Loading fields...' : 'Loading objects...';
    dom.suggestionItems.innerHTML = `<div class="suggestion-item loading">${loadingText}</div>`;
    dom.suggestionItems.style.display = 'flex';
    state.suggestionVisible = true;
    state.selectedSuggestionIndex = -1;
}

function createSuggestionElm(idx, type, itemName, itemLabel, itemType) {
    const div = document.createElement('div');
    div.classList.add('suggestion-item');
    div.tabIndex = 0;

    div.dataset.value = itemName;
    div.title = itemLabel || itemName;

    div.classList.add(`${type}-suggestion`);

    if (state.iconMap && state.iconMap[itemType]) {
        const iconImg = document.createElement('img');
        iconImg.src = state.iconMap[itemType];
        iconImg.className = 'suggestion-icon';
        div.appendChild(iconImg);
    }

    const labelSpan = document.createElement('span');
    labelSpan.className = 'suggestion-label';
    labelSpan.textContent = itemName;
    div.appendChild(labelSpan);

    div.onclick = (ev) => { ev.preventDefault(); insertSuggestion(itemName); };
    div.onkeydown = (ev) => {
        if (ev.key === 'Enter' &&
            !ev.shiftKey &&
            !ev.ctrlKey &&
            !ev.altKey &&
            !ev.metaKey) {
            ev.preventDefault();
            insertSuggestion(itemName);
        }
    };
    div.onfocus = () => setSelected(idx);
    return div;
}

function setSelected(idx) {
    const items = Array.from(dom.suggestionItems.getElementsByClassName('suggestion-item'));
    if (!items.length) return;
    items.forEach(it => it.classList.remove('selected'));
    state.selectedSuggestionIndex = Math.max(0, Math.min(idx, items.length - 1));
    items[state.selectedSuggestionIndex].classList.add('selected');
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
    dom.suggestionsContainer.style.display = 'none';
    dom.suggestionItems.innerHTML = '';
    state.selectedSuggestionIndex = -1;
}

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
   Main input handler
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
    fetchObjectMetadataIfNeeded(validObj.name);

    if (info.parentName && info.parentName !== validObj.name) {
        fetchObjectMetadataIfNeeded(info.parentName);
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
                    fetchObjectMetadataIfNeeded(state.currentObject);
                }
                showSuggestions(state.token, 'field');
            }
        }
    } catch (err) {
        console.error('handleRelatedObj error: ' + (err && err.message ? err.message : String(err)));
    }

}
