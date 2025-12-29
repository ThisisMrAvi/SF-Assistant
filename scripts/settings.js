import { dom, initSettingsDom } from "./dom.js";
import { state } from "./state.js";
import { handleCopy } from "./utils.js";
import { BaseModal } from "./baseModal.js";

class SettingsModal extends BaseModal {
    #initialized = false;
    #previousPageName = null;
    #listeners = {
        themeChange: (e) => {
            const selectedTheme = e.target.value;
            document.body.classList.remove("light", "dark");
            document.body.classList.add(selectedTheme);
            localStorage.setItem("sf-assist-theme", selectedTheme);
        },
        copySessionId: (e) => {
            const sessionId = state.orgInfo?.accessToken;
            handleCopy(e.currentTarget, sessionId);
        },
        copyLoginUrl: (e) => {
            try {
                const loginUrl = `${state.orgInfo.instanceUrl}/secur/frontdoor.jsp?sid=${state.orgInfo.accessToken}`;
                handleCopy(e.currentTarget, loginUrl);
            } catch (error) {
                console.error("Error loading login details: ", error);
            }
        }
    };

    constructor() {
        super({
            modalContainerElm: dom.modalSection,
            modalTitleElm: dom.modalTitle,
            modalBodyElm: dom.modalBody,
            modalBackdropElm: dom.modalBackdrop,
            modalCloseElm: dom.modalCloseBtn,
        });
    }

    init() {
        super.init();

        // Only initialize listeners once
        if (!this.#initialized) {
            // Theme select
            if (dom.themeSelect) {
                dom.themeSelect.value = localStorage.getItem("sf-assist-theme") || "light";
                dom.themeSelect.addEventListener("change", this.#listeners.themeChange);
            }

            // Copy session id
            dom.copySessionId?.addEventListener("click", this.#listeners.copySessionId);

            // Copy login url
            dom.copyLoginUrl?.addEventListener("click", this.#listeners.copyLoginUrl);

            this.#initialized = true;
        }

        // Update org info every time modal is initialized
        this.#updateOrgInfo();
    }

    close() {
        // Restore the previous page name when closing settings modal
        if (this.#previousPageName) {
            state.pageName = this.#previousPageName;
        }
        super.close();
    }

    setPreviousPageName(pageName) {
        this.#previousPageName = pageName;
    }

    #updateOrgInfo() {
        const orgInfo = state.orgInfo;
        if (!orgInfo) {
            return;
        }

        // Update each field if the element exists
        const orgInfoMap = {
            alias: orgInfo.alias || 'N/A',
            username: orgInfo.username || 'N/A',
            instanceUrl: orgInfo.instanceUrl || 'N/A',
            orgId: orgInfo.id || 'N/A'
        };

        Object.entries(orgInfoMap).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }
}

// Exported entry
export let settingsModal;
export function openSettings(htmlContent, previousPageName) {
    if (!settingsModal) {
        settingsModal = new SettingsModal();
    }
    settingsModal.setModalContent("Settings", htmlContent);
    settingsModal.setPreviousPageName(previousPageName);
    initSettingsDom(); // Initialize DOM references first
    settingsModal.init(); // Will only add listeners once
    settingsModal.open();
}
