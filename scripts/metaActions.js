import { state } from "./state.js";
import { dom } from "./dom.js";
import { debounce, fetchObjectMetadataIfNeeded } from "./utils.js";

/**
 * Initialize Meta Explorer actions
 */
export function initMetaExplorerActions() {
    if (dom.toolingInput) {
        dom.toolingInput.checked = state.isTooling;
    }

    // Request object list if not loaded
    if (!state.isTooling && !state.objectsList) {
        state.vscode.postMessage({
            command: "requestObjectList",
            isTooling: false,
        });
    }
    if (state.isTooling && !state.toolingObjectsList) {
        state.vscode.postMessage({
            command: "requestToolingObjectList",
            isTooling: true,
        });
    }

    // Live filter
    if (dom.objectNameInput) {
        dom.objectNameInput.addEventListener("input", debounce(renderVirtualList, 300));
    }

    // Tooling toggle
    if (dom.toolingInput) {
        dom.toolingInput.addEventListener("change", handleToolingApiChange);
    }

    renderVirtualList();
}

/**
 * Virtualized object list
 */
export function renderVirtualList() {
    const container = dom.objectListContainer;
    if (!container) return;

    const searchKey = dom.objectNameInput?.value?.toLowerCase().trim() || "";
    const objects = state.isTooling ? state.toolingObjectsList : state.objectsList;
    if (!objects || !objects.length) {
        container.innerHTML = `<p class="info-text">Loading Objects...</p>`;
        return;
    }

    const filtered = objects.filter(obj =>
        obj.label?.toLowerCase().includes(searchKey) ||
        obj.name?.toLowerCase().includes(searchKey) ||
        obj.keyPrefix?.toLowerCase().includes(searchKey)
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

    function renderRows() {
        const scrollTop = container.scrollTop;
        const startIndex = Math.floor(scrollTop / rowHeight);
        const endIndex = Math.min(startIndex + visibleCount, filtered.length);

        container.querySelectorAll(".object-card").forEach(el => el.remove());

        for (let i = startIndex; i < endIndex; i++) {
            const obj = filtered[i];
            const card = createObjectElem(obj);
            card.style.position = "absolute";
            card.style.top = `${i * rowHeight}px`;
            card.style.left = "0";
            card.style.right = "0";
            container.appendChild(card);
        }
    }

    // prevent duplicate listeners
    container.removeEventListener("scroll", renderRows);
    container.addEventListener("scroll", renderRows);
    renderRows();
}

/**
 * Create object card
 */
function createObjectElem(obj) {
    const card = document.createElement("div");
    card.className = "object-card";
    card.innerHTML = `
        <div class="object-header">
            <span class="object-label">${obj.label}</span>
            <span class="key-prefix">${obj.keyPrefix || "N/A"}</span>
        </div>
        <div class="object-sub"><strong>API:</strong> ${obj.name}</div>
    `;
    card.addEventListener("click", () => viewObjectMeta(obj.name));
    return card;
}

/**
 * Show metadata for selected object
 */
export function viewObjectMeta(objName) {
    const viewer = dom.objectMetaViewer;
    if (!viewer) return;

    document.getElementById("objectTitle").textContent = objName;
    viewer.innerHTML = `<p class="info-text">Loading metadata for ${objName}...</p>`;

    fetchObjectMetadataIfNeeded(objName);

    if (state.objectMeta[objName]) {
        renderObjectMeta(state.objectMeta[objName], viewer);
    }
}

/**
 * Render metadata with lazy collapsibles
 */
function renderObjectMeta(objMeta, container) {
    if (!container) return;
    container.objMeta = objMeta;

    let html = "";

    // Root string props
    const stringProps = Object.keys(objMeta)
        .filter(key => typeof objMeta[key] === "string")
        .map(key => `<tr><td>${key}</td><td>${objMeta[key]}</td></tr>`)
        .join("");

    if (stringProps) {
        html += renderCollapsibleSection("Object Properties", stringProps, ["Property", "Value"]);
    }

    // Fields
    if (Array.isArray(objMeta.fields)) {
        html += renderLazySection("Fields", objMeta.fields.length, "fields", ["Field API", "Label", "Type"]);
    }

    // Child Relationships
    if (Array.isArray(objMeta.childRelationships)) {
        html += renderLazySection("Child Relationships", objMeta.childRelationships.length, "relationships", ["Relationship Name", "Child Object", "Field", "Label"]);
    }

    container.innerHTML = html;
    initCollapsibles(container);
}

/**
 * Collapsible section
 */
function renderCollapsibleSection(title, rowsHtml, headers = []) {
    const table = headers.length
        ? `<table class="meta-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rowsHtml}</tbody></table>`
        : rowsHtml;

    return `
        <div class="collapsible-section">
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
 * Initialize collapsibles
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

                    content.innerHTML = `<table class="meta-table">
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

                    content.innerHTML = `<table class="meta-table">
                            <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>`;
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

/**
 * Tooling API toggle
 */
function handleToolingApiChange() {
    state.isTooling = dom.toolingInput.checked;
    const objReq = state.isTooling ? "requestToolingObjectList" : "requestObjectList";
    state.vscode.postMessage({
        command: objReq,
        isTooling: state.isTooling,
    });
}