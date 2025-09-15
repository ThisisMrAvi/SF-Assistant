// Cached DOM references (will be refreshed on demand)
export const dom = {};

// Function to initialize or re-initialize DOM references
export function initMainDom() {
    // Main component dom elemets
    dom.content = document.getElementById('content');
    dom.modalContainer = document.getElementById('modalContainer');
    dom.modalBackdrop = document.getElementById('modalBackdrop');
    dom.appBtn = document.getElementById('appBtn');
    dom.sidebar = document.getElementById('sidebar');
    dom.closeSidebarBtn = document.getElementById('closeSidebarBtn');
    dom.links = document.querySelectorAll('.sidebar a');
}

// Function to initialize or re-initialize Settings DOM references
export function initSettingsDom() {
    //Settings dom elements
    dom.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    dom.themeSelect = document.getElementById('themeSelect');
    dom.copySessionId = document.getElementById('copySessionId');
    dom.copyLoginUrl = document.getElementById('copyLoginUrl');
}

// Function to initialize or re-initialize SOQL DOM references
export function initSoqlDom() {
    // SOQL Query dom elements
    dom.queryInput = document.getElementById('soqlQuery');
    dom.runQueryBtn = document.getElementById('runQueryBtn');
    dom.saveQueryBtn = document.getElementById('saveQueryBtn');
    dom.saveLabelInput = document.getElementById('saveLabel');
    dom.labelError = document.getElementById('labelError');
    dom.queryError = document.getElementById('queryError');
    dom.suggestionsContainer = document.getElementById('suggestionsContainer');
    dom.suggestionItems = document.getElementById('suggestionItems');
    dom.suggestionsTitle = document.getElementById('suggestionsTitle');
    dom.savedQueriesDropdown = document.getElementById('savedQueriesDropdown');
    dom.deleteQueryBtn = document.getElementById('deleteQueryBtn');
    dom.resultContainer = document.getElementById('resultContainer');
    dom.resultDiv = document.getElementById('resultTable');
    dom.filterInput = document.getElementById('filterInput');
    dom.filterResultText = document.getElementById('filterResultText');
    dom.exportCSVBtn = document.getElementById('exportCSVBtn');
    dom.exportJSONBtn = document.getElementById('exportJSONBtn');
    dom.statusBar = document.getElementById('statusBar');
    dom.toolingInput = document.getElementById('isToolingCheckbox');
}

// Function to initialize or re-initialize Meta Explorer DOM references
export function initMetaDom() {
    // Meta Explorer dom elements
    dom.objectNameInput = document.getElementById('objectNameInput');
    dom.objectListContainer = document.getElementById('objectListContainer');
    dom.objectMetaViewer = document.getElementById('objectMetaViewer');
    dom.toolingInput = document.getElementById('isToolingCheckbox');
}

