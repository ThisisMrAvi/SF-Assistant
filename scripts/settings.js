import { dom } from "./dom.js";
import { state } from "./state.js";
import { handleCopy } from "./utils.js";

/**
 * Initialize Meta Explorer actions
 */
export function initSettingsActions() {

    // Settings event wiring
    if (dom.closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeModal);
    if (dom.modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

    // Change theme
    if (dom.themeSelect) {
        dom.themeSelect.value = localStorage.getItem("sf-assist-theme") || "light";
        themeSelect.addEventListener('change', (e) => {
            const selectedTheme = e.target.value;
            document.body.classList.remove('light', 'dark');
            document.body.classList.add(selectedTheme);
            localStorage.setItem('sf-assist-theme', selectedTheme);
        });
    }

    if (dom.copySessionId) {
        dom.copySessionId.addEventListener("click", function (e) {
            const sessionId = state.orgInfo?.accessToken;
            handleCopy(e, sessionId);
        });
    }

    if (dom.copyLoginUrl) {
        dom.copyLoginUrl.addEventListener("click", function (e) {
            try {
                const loginUrl = `${state.orgInfo.instanceUrl}/secur/frontdoor.jsp?sid=${state.orgInfo.accessToken}`;
                handleCopy(e, loginUrl);
            } catch (error) {
                console.error("Error loading login details: ", error);
            }
        });
    }

    // Close settings modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.modalContainer && !dom.modalContainer.classList.contains('hidden')) {
            closeModal();
        }
    });
}

function closeModal() {
    if (dom.modalContainer) dom.modalContainer.classList.add('hidden');
    if (dom.modalBackdrop) dom.modalBackdrop.classList.add('hidden');
}