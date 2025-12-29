import { getObjectList, getObjectMeta, handleObjectMetadataRequest, hasObjectMeta, state, toggleToolingMode } from "./state.js";
import { dom } from "./dom.js";
import { debounce, exportJSON, makeTableSortable } from "./utils.js";

// Store listeners at module level
const listeners = {
    filter: debounce(renderVirtualList, 300),
    toolingChange: handleToolingApiChange
};

/**
 * Initialize Meta Explorer actions
 */
export function initMetaExplorerActions() {
    if (!dom.objectListContainer) {
        console.warn('Meta Explorer DOM not ready');
        // initialize after a short delay in case DOM is not ready yet
        setTimeout(initMetaExplorerActions, 2000);
        return;
    }

    // Set initial tooling state
    if (dom.toolingInput) {
        dom.toolingInput.checked = state.isTooling;
    }

    // Add event listeners with optional chaining
    dom.objectNameInput?.addEventListener("input", listeners.filter);
    dom.toolingInput?.addEventListener("change", listeners.toolingChange);

    // Initial render
    renderVirtualList();

    // if (dom.moreInfoBtn) {
    //     dom.moreInfoBtn.addEventListener("click", (e) => {
    //         const objMeta = dom.objectMetaViewer?.objMeta;
    //         if (!objMeta) {
    //             return;
    //         }
    //         exportJSON(e, objMeta, null, true);
    //     });
    // }

    if (dom.downloadMetaBtn) {
        dom.downloadMetaBtn.addEventListener("click", (e) => {
            const objMeta = dom.objectMetaViewer?.objMeta;
            if (!objMeta) {
                return;
            }
            exportJSON(e, objMeta, null, false);
        });
    }
}

/**
 * Virtualized object list
 */
export function renderVirtualList() {
    const container = dom.objectListContainer;
    if (!container) return;

    const metaInputVal = dom.objectNameInput?.value?.trim() || "";
    const searchKey = metaInputVal?.toLowerCase();
    let searchKeyPrefix, recordId;
    if (metaInputVal.length >= 3) {
        searchKeyPrefix = metaInputVal.slice(0, 3);
        recordId = metaInputVal.length === 15 || metaInputVal.length === 18 ? metaInputVal : null;
    }

    const objects = getObjectList();
    if (!objects || !objects.length) {
        container.innerHTML = `<p class="info-text">Loading Objects...</p>`;
        return;
    }

    const filtered = objects.filter(obj =>
        obj.label?.toLowerCase().includes(searchKey) ||
        obj.name?.toLowerCase().includes(searchKey) ||
        (searchKeyPrefix && obj.keyPrefix?.includes(searchKeyPrefix))
    );

    const rowHeight = 70;
    const viewportHeight = container.clientHeight || 600;
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + 5;

    container.innerHTML = "";
    container.style.position = "relative";
    container.style.overflowY = "auto";
    container.style.height = "calc(100vh - 120px)";

    const spacer = document.createElement("div");
    spacer.style.height = `${filtered.length * rowHeight}px`;
    container.appendChild(spacer);

    // --- Card Pool ---
    const pool = [];

    // If recordId is provided and matches an object, view its metadata
    if (recordId) {
        if (filtered.length >= 1) {
            let objData = filtered[0];
            filtered.unshift({
                label: recordId,
                labelPlural: recordId,
                name: objData.name,
                keyPrefix: objData.keyPrefix,
                isRecord: true
            });
        }
    }

    for (let i = 0; i < visibleCount; i++) {
        const card = createObjectElem();
        card.style.position = "absolute";
        card.style.left = "0";
        card.style.right = "0";
        container.appendChild(card);
        pool.push(card);
    }

    function renderRows() {
        const scrollTop = container.scrollTop;
        const startIndex = Math.floor(scrollTop / rowHeight);

        for (let i = 0; i < visibleCount; i++) {
            const index = startIndex + i;
            const card = pool[i];

            if (index < filtered.length) {
                const obj = filtered[index];
                updateObjectElem(card, obj);
                card.style.top = `${index * rowHeight}px`;
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        }
    }

    // prevent duplicate listeners
    container.removeEventListener("scroll", renderRows);
    container.addEventListener("scroll", renderRows);
    renderRows();
}

/**
 * Tooling API toggle
 */
function handleToolingApiChange() {
    state.isTooling = dom.toolingInput.checked;
    toggleToolingMode(state.isTooling);
}

/**
 * Create object card
 */
function createObjectElem() {
    const card = document.createElement("div");
    card.className = "meta-card";

    card.innerHTML = `
        <div class="meta-card-header">
            <span class="meta-card-label"></span>
            <span class="key-prefix"></span>
        </div>
        <div class="meta-card-sub">
            <strong>API:</strong>
            <span class="api-name"></span>
        </div>
    `;

    // ---- Cache DOM references ----
    card._refs = {
        label: card.querySelector(".meta-card-label"),
        keyPrefix: card.querySelector(".key-prefix"),
        apiName: card.querySelector(".api-name")
    };

    // Click handler (attached once)
    card.addEventListener("click", (e) => {
        const apiName = card.dataset.apiName;
        const metaType = card.dataset.metaType;
        toggleExportButtons(false);
        if (apiName && metaType === "record") {
            viewRecordMeta(card.dataset.recordId, apiName);
        } else if (apiName) {
            viewObjectMeta(apiName);
        }
    });

    return card;
}

/**
 * Update object card (for pooled reuse)
 */
function updateObjectElem(card, obj) {
    const { label, keyPrefix, apiName } = card._refs;

    label.textContent = obj.label || "";
    keyPrefix.textContent = obj.keyPrefix || "N/A";
    apiName.textContent = obj.name || "";

    card.dataset.apiName = obj.name || "";
    if (obj.isRecord) {
        card.dataset.metaType = "record";
        card.dataset.recordId = obj.label;
    }
}

/**
 * Show metadata for selected object
 */
export function viewRecordMeta(recordId, objName) {
    const viewer = dom.objectMetaViewer;
    if (!viewer) {
        console.warn('Meta Viewer DOM not ready');
        return;
    }

    document.getElementById("objectTitle").textContent = `${recordId} (${objName})`;
    viewer.innerHTML = `<p class="info-text">Loading metadata for ${recordId} (${objName})...</p>`;
    state.vscode.postMessage({ command: 'requestRecordMeta', recordId: recordId, objectType: objName, isTooling: state.isTooling });
}

export function handleRecordMetadataMessage(recordData) {
    renderMetaView(recordData, dom.objectMetaViewer);
}

/**
 * Show metadata for selected object
 */
export function viewObjectMeta(objName) {
    const viewer = dom.objectMetaViewer;
    if (!viewer) return;

    document.getElementById("objectTitle").textContent = objName;
    viewer.innerHTML = `<p class="info-text">Loading metadata for ${objName}...</p>`;
    handleObjectMetadataRequest(objName);

    if (hasObjectMeta(objName)) {
        renderMetaView(getObjectMeta(objName), viewer);
    }
}

/**
 * Render metadata with lazy collapsibles
 */
function renderMetaView(objMeta, container) {
    if (!container) return;
    container.objMeta = objMeta;

    let html = "";

    // Root props
    const primitiveProps = getPrimitiveProperties(objMeta);

    if (primitiveProps) {
        html += renderCollapsibleSection("Object Properties", primitiveProps, ["Property", "Value"]);
    }

    // Fields
    if (Array.isArray(objMeta.fields)) {
        html += renderLazySection("Fields", objMeta.fields.length, "fields", ["Field API", "Label", "Type"]);
    }

    // Child Relationships
    if (Array.isArray(objMeta.childRelationships)) {
        html += renderLazySection("Child Relationships", objMeta.childRelationships.length, "relationships", ["Relationship Name", "Child Object", "Field", "Label"]);
    }

    // Create Collapsibles for object/List type properties
    for (const key in objMeta) {
        if (key === "fields" || key === "childRelationships") {
            continue; // already handled
        }
        const value = objMeta[key];
        if (value && typeof value === "object") {
            if (!Array.isArray(value)) {
                const subProps = getPrimitiveProperties(value);
                if (subProps) {
                    html += renderCollapsibleSection(key, subProps, ["Property", "Value"]);
                }
            } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
                const subProps = getPrimitiveProperties(value[0]);
                html += renderLazySection(key, value.length, key, Object.keys(value[0]));
            }
        }
    }

    container.innerHTML = html;
    initCollapsibles(container);
    toggleExportButtons(true);
}

function getPrimitiveProperties(obj) {
    return Object.keys(obj)
        .filter(key => {
            const value = obj[key];
            return value === null || (typeof value !== "object" && !Array.isArray(value));
        })
        .map(key => `<tr><td>${key}</td><td>${obj[key]}</td></tr>`)
        .join("");
}

/**
 * Collapsible section
 */
function renderCollapsibleSection(title, rowsHtml, headers = []) {
    const table = headers.length
        ? `<table class="table-base meta-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`
        : rowsHtml;

    return `
        <div class="collapsible-section collapsed">
            <div class="collapse-header">
                <span>${title}</span>
                <span class="collapse-icon"></span>
            </div>
            <div class="collapse-content">${table}</div>
        </div>`;
}

/**
 * Lazy-loaded collapsible
 */
function renderLazySection(title, count, sectionType, headers = []) {
    return `
        <div class="collapsible-section collapsed" data-lazy="${sectionType}">
            <div class="collapse-header">
                <span>${title} (${count})</span>
                <span class="collapse-icon"></span>
            </div>
            <div class="collapse-content" data-headers='${JSON.stringify(headers)}'></div>
        </div>`;
}

/**
 * Initialize collapsibles with sortable tables
 */
function initCollapsibles(container) {
    container.querySelectorAll(".collapsible-section").forEach(section => {
        const header = section.querySelector(".collapse-header");
        if (!header) return;

        header.addEventListener("click", () => {
            section.classList.toggle("collapsed");

            const content = section.querySelector(".collapse-content");
            const objMeta = container.objMeta;
            const sectionType = section.dataset.lazy;

            if (
                sectionType &&
                !section.classList.contains("collapsed") &&
                content &&
                !content.hasChildNodes()
            ) {
                const headers = JSON.parse(content.getAttribute("data-headers") || "[]");

                if (sectionType === "fields") {
                    // Add new column header
                    const extendedHeaders = [...headers, "Picklist/Formula"];

                    const rows = objMeta.fields.map(f => {
                        // --- Build details text ---
                        let details = "";

                        // Picklist values
                        if ((f.type === "picklist" || f.type === "multipicklist") && Array.isArray(f.picklistValues)) {
                            details = f.picklistValues.map(v => v.label).join(", ");
                        }

                        // Calculated fields
                        if (f.calculated) {
                            details = f.calculatedFormula || f.label || details;
                        }

                        // --- Build type cell ---
                        let typeText = f.type;
                        if (f.length) {
                            typeText += ` (${f.length})`;
                        }
                        if (f.calculated) {
                            typeText += ", calculated";
                        }

                        // Reference fields
                        if (f.type === "reference" && Array.isArray(f.referenceTo) && f.referenceTo.length) {
                            const refs = f.referenceTo
                                .map(r => `<a href="#" class="child-link" data-child="${r}">${r}</a>`)
                                .join(", ");
                            return `<tr>
                                        <td>${f.name}</td>
                                        <td>${f.label}</td>
                                        <td>${f.type} (${refs})</td>
                        <td>${details}</td>
                                    </tr>`;
                        }

                        return `<tr>
                                <td>${f.name}</td>
                                <td>${f.label}</td>
                                <td>${typeText}</td>
                <td>${details}</td>
                                </tr>`;
                    }).join("");

                    content.innerHTML = `<table class="table-base meta-table">
                            <thead><tr>${extendedHeaders.map(h => `<th>${h}</th>`).join("")}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>`;
                }

                if (sectionType === "relationships") {
                    const rows = objMeta.childRelationships.map(r => `<tr>
                                <td>${r.relationshipName || "(none)"}</td>
                                <td><a href="#" class="child-link" data-child="${r.childSObject}">${r.childSObject}</a></td>
                                <td>${r.field || ""}</td>
                                <td>${r.label || ""}</td>
                            </tr>`).join("");

                    content.innerHTML = `<table class="table-base meta-table">
                            <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>`;
                }

                // Make table sortable
                const table = content.querySelector(".meta-table");
                if (table) {
                    makeTableSortable(table);
                }

                // Add click listeners for child links
                content.querySelectorAll(".child-link").forEach(link => {
                    link.addEventListener("click", e => {
                        e.preventDefault();
                        const objName = link.dataset.child;
                        if (objName) {
                            viewObjectMeta(objName);
                        }
                    });
                });
            }
        });
    });
}

function toggleExportButtons(enabled) {
    // if (dom.moreInfoBtn) {
    //     if (enabled) {
    //         dom.moreInfoBtn.classList.remove("hidden");
    //     } else {
    //         dom.moreInfoBtn.classList.add("hidden");
    //     }
    // }
    if (dom.downloadMetaBtn) {
        if (enabled) {
            dom.downloadMetaBtn.classList.remove("hidden");
        } else {
            dom.downloadMetaBtn.classList.add("hidden");
        }
    }
}