import { initSuggestions } from "./suggestions.js";
import { initQueryActions } from "./queryActions.js";
import { initMessaging } from "./messaging.js";
import { dom, initMainDom, initMetaDom, initSettingsDom, initSoqlDom } from "./dom.js";
import { state } from "./state.js";
import { initMetaExplorerActions } from "./metaActions.js";
import { initSettingsActions } from "./settings.js";

/**
 * Main DOM wiring
 */
document.addEventListener('DOMContentLoaded', () => {
    initMainDom();

    // Theme load
    try {
        const savedTheme = localStorage.getItem("sf-assist-theme") || "light";
        document.body.classList.remove("light", "dark");
        document.body.classList.add(savedTheme);
    } catch (e) {
        console.warn('Theme load failed', e);
    }

    // Debug: ensure core elements present
    if (!dom.sidebar) console.error('Sidebar (#sidebar) not found in DOM');
    if (!dom.appBtn) console.warn('Menu button (#appBtn) not found — mobile toggle won\'t be available');
    if (!dom.content) console.error('#content element not found');


    // Init messaging after wiring UI
    try {
        initMessaging();
    } catch (e) {
        console.warn('initMessaging failed', e);
    }

    // Menu button behavior
    if (dom.appBtn && dom.sidebar) {
        dom.appBtn.addEventListener("click", () => {
            dom.sidebar.classList.toggle("active");
        });
    }

    // Sidebar link handling
    if (dom.links && dom.links.length > 0) {
        dom.links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();

                const page = link.getAttribute('data-page');
                if (page) {
                    loadPage(page);
                }

                dom.sidebar?.classList.remove('active');
            });
        });
    }

    if (dom.closeSidebarBtn && dom.sidebar) {
        dom.closeSidebarBtn.addEventListener('click', () => {
            dom.sidebar.classList.remove('active');
        });
    }

    // Close Options sidebar on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.sidebar && dom.sidebar.classList.contains('active')) {
            dom.sidebar.classList.remove('active');
        }
    });
});

/**
 * Request the extension host to load a page
 */
async function loadPage(pageName) {
    const content = dom.content;
    try {
        if (!state || !state.vscode || typeof state.vscode.postMessage !== 'function') {
            console.warn('state.vscode.postMessage is not available — skipping host loadPage call.');
            if (content) content.innerHTML = `<p style="color:orange;">(Dev) Would load page: ${pageName}</p>`;
            return;
        }
        state.vscode.postMessage({ command: 'loadPage', pageName: pageName });
    } catch (err) {
        console.error('loadPage error', err);
        if (content) content.innerHTML = `<p style="color:red;">Failed to load ${pageName}</p>`;
    }
}

/**
 * Inject page HTML into the content area and run any scripts found inside it.
 */
export async function injectPage(pageName, pageContent) {
    const content = dom.content;
    try {
        state.pageName = pageName;
        if (!content) {
            console.error('injectPage: #content not found');
            return;
        }

        // Page-specific inits
        switch (pageName) {
            case 'soql-panel':
                content.innerHTML = pageContent ?? '<p>No content</p>';
                activateNavLink(pageName);
                initSoqlDom();
                initSuggestions();
                initQueryActions();
                break;
            case 'meta-explorer':
                content.innerHTML = pageContent ?? '<p>No content</p>';
                activateNavLink(pageName);
                initMetaDom();
                initMetaExplorerActions();
                break;
            case 'settings':
                openModal();
                dom.modalContainer.innerHTML = pageContent ?? '<p>No content</p>';
                initSettingsDom();
                initSettingsActions();
                break;
            default:
                console.log('Injected page:', pageName);
                break;
        }
    } catch (err) {
        console.error('injectPage error', err);
        if (content) content.innerHTML = `<p style="color:red;">Failed to load page: ${pageName}</p>`;
    }
}

// modal helpers
function openModal() {
    if (dom.modalContainer) {
        dom.modalContainer.classList.remove('hidden');
    }
    if (dom.modalBackdrop) {
        dom.modalBackdrop.classList.remove('hidden');
    }
}

function activateNavLink(pageName) {
    // Ensure sidebar active state is consistent
    dom.links.forEach(l => l.classList.remove('active'));
    const linkEl = document.querySelector(`#sidebar a[data-page="${pageName}"]`);
    if (linkEl) linkEl.classList.add('active');
}