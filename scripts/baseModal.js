// baseModal.js
export class BaseModal {
    constructor({ modalContainerElm, modalTitleElm, modalBodyElm, modalBackdropElm, modalCloseElm }) {
        if (new.target === BaseModal) {
            throw new TypeError("BaseModal is abstract and cannot be instantiated directly.");
        }
        this.modalTitleElm = modalTitleElm;
        this.modalContainerElm = modalContainerElm;
        this.modalBodyElm = modalBodyElm;
        this.modalBackdropElm = modalBackdropElm;
        this.modalCloseElm = modalCloseElm;

        // Bind handlers so we can remove them later
        this.handleCloseClick = this.handleCloseClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }

    init() {
        if (this.modalCloseElm) {
            this.modalCloseElm.addEventListener("click", this.handleCloseClick);
        }
        if (this.modalBackdropElm) {
            this.modalBackdropElm.addEventListener("click", this.handleCloseClick);
        }
        // Close on Escape
        document.addEventListener("keydown", this.handleKeyDown);
    }

    destroy() {
        if (this.modalCloseElm) {
            this.modalCloseElm.removeEventListener("click", this.handleCloseClick);
        }
        if (this.modalBackdropElm) {
            this.modalBackdropElm.removeEventListener("click", this.handleCloseClick);
        }

        document.removeEventListener("keydown", this.handleKeyDown);
    }

    open() {
        if (this.modalContainerElm) this.modalContainerElm.classList.remove("hidden");
        if (this.modalBackdropElm) this.modalBackdropElm.classList.remove("hidden");
    }

    close() {
        if (this.modalContainerElm) this.modalContainerElm.classList.add("hidden");
        if (this.modalBackdropElm) this.modalBackdropElm.classList.add("hidden");
    }

    handleCloseClick() {
        this.close();
    }


    handleKeyDown(e) {
        if (e.key === "Escape" && this.isOpen()) {
            this.close();
        }
    }

    isOpen() {
        return this.modalContainerElm && !this.modalContainerElm.classList.contains("hidden");
    }

    setModalContent(title, htmlContent) {
        this.modalTitleElm.textContent = title;
        this.modalBodyElm.innerHTML = htmlContent ?? '<p>No content</p>';
    }
}