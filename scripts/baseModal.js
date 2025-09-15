export class BaseModal {
    constructor({ container, backdrop, closeBtn }) {
        if (new.target === BaseModal) {
            throw new TypeError("Cannot instantiate abstract class BaseModal directly");
        }
        this.modalContainer = typeof container === "string" ? document.querySelector(container) : container;
        this.modalBackdrop = typeof backdrop === "string" ? document.querySelector(backdrop) : backdrop;
        this.closeBtn = typeof closeBtn === "string" ? document.querySelector(closeBtn) : closeBtn;

        this._wireEvents();
    }

    _wireEvents() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener("click", () => this.close());
        }
        if (this.modalBackdrop) {
            this.modalBackdrop.addEventListener("click", () => this.close());
        }

        // Close on Escape
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.isOpen()) {
                this.close();
            }
        });
    }

    open() {
        if (this.modalContainer) this.modalContainer.classList.remove("hidden");
        if (this.modalBackdrop) this.modalBackdrop.classList.remove("hidden");
    }

    close() {
        if (this.modalContainer) this.modalContainer.classList.add("hidden");
        if (this.modalBackdrop) this.modalBackdrop.classList.add("hidden");
    }

    isOpen() {
        return this.modalContainer && !this.modalContainer.classList.contains("hidden");
    }
}
