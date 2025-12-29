// === Shared State ===
const vscodeApi = acquireVsCodeApi();

export const state = {

    vscode: vscodeApi,

    orgInfo: {},
    token: '',
    pageName: '',

    // Object Data
    objects: {
        standard: [],
        tooling: []
    },
    objectMeta: {},

    // Suggestions
    iconMap: {},
    suggestionVisible: false,
    selectedSuggestionIndex: -1,
    currentObject: '',
    lastObject: '',
    token: '',
    showAttributeColumns: true,

    // Mode
    isTooling: false,

    // Request guards
    loading: {
        objects: {
            standard: false,
            tooling: false
        },
        objectMeta: Object.create(null),
        query: false
    }
};

// Operators by field type
export const operatorSuggestions = Object.freeze({
    string: ["=", "!=", "LIKE", "IN", "NOT IN"],
    boolean: ["=", "!="],
    int: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    double: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    currency: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    date: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    datetime: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    reference: ["=", "!=", "IN"],
    multipicklist: ["INCLUDES", "EXCLUDES"],
    picklist: ["=", "!="],
    email: ["=", "!=", "LIKE"],
    phone: ["=", "!=", "LIKE"],
    url: ["=", "!=", "LIKE"],
    id: ["=", "!="]
});

// SOQL Date Filter
export const dateLiterals = Object.freeze([
    `${new Date().toISOString()}`,  // Current date in ISO format
    "YESTERDAY", "TODAY", "TOMORROW",
    "LAST_WEEK", "THIS_WEEK", "NEXT_WEEK",
    "LAST_MONTH", "THIS_MONTH", "NEXT_MONTH",
    "LAST_90_DAYS", "NEXT_90_DAYS",
    "THIS_QUARTER", "LAST_QUARTER", "NEXT_QUARTER",
    "THIS_YEAR", "LAST_YEAR", "NEXT_YEAR",
    "LAST_FISCAL_QUARTER", "LAST_FISCAL_YEAR",
    "NEXT_FISCAL_QUARTER", "NEXT_FISCAL_YEAR",
    "THIS_FISCAL_QUARTER", "THIS_FISCAL_YEAR",
    "LAST_N_DAYS:n", "LAST_N_FISCAL_QUARTERS:n", "LAST_N_FISCAL_YEARS:n",
    "LAST_N_MONTHS:n", "LAST_N_QUARTERS:n", "LAST_N_WEEKS:n", "LAST_N_YEARS:n",
    "N_DAYS_AGO:n", "N_FISCAL_QUARTERS_AGO:n", "N_FISCAL_YEARS_AGO:n",
    "N_MONTHS_AGO:n", "N_QUARTERS_AGO:n", "N_WEEKS_AGO:n", "N_YEARS_AGO:n",
    "NEXT_N_DAYS:n", "NEXT_N_FISCAL_QUARTERS:n", "NEXT_N_FISCAL_YEARS:n",
    "NEXT_N_MONTHS:n", "NEXT_N_QUARTERS:n", "NEXT_N_WEEKS:n", "NEXT_N_YEARS:n"
]);

/**
 * Get the appropriate object list based on isTooling flag
 */
export function getObjectList() {
    return state.isTooling
        ? state.objects.tooling
        : state.objects.standard;
}

/**
 * fetch object list if not already loaded
 */
export function handleObjectListRequest() {
    // Check if already loading to prevent duplicate requests
    const key = state.isTooling ? 'tooling' : 'standard';

    if (state.loading.objects[key]) {
        return;
    }

    const list = state.objects[key];
    if (list.length > 0) return;

    requestObjectsList(state.isTooling);
}

function requestObjectsList(isTooling) {
    const key = isTooling ? 'tooling' : 'standard';
    state.loading.objects[key] = true;
    state.vscode.postMessage({
        command: isTooling
            ? "requestToolingObjectList"
            : "requestObjectList",
        isTooling: isTooling
    });
}

export function resolveObjectList(isTooling, objects) {
    const key = isTooling ? 'tooling' : 'standard';
    state.objects[key] = objects;
    state.loading.objects[key] = false;
}

export function hasObjectMeta(objectName) {
    return Boolean(state.objectMeta[objectName]);
}

/**
 * Get the metadata for a specific object
 */
export function getObjectMeta(objectName) {
    return state.objectMeta[objectName];
}

/**
 * Fetch metadata for a specific object
 */
export function handleObjectMetadataRequest(objectName) {
    if (!objectName) {
        return;
    }

    // Check if metadata already exists
    if (state.objectMeta[objectName]) {
        return;
    }

    // Check if already loading to prevent duplicate requests
    if (state.loading.objectMeta[objectName]) {
        return;
    }

    // Mark as loading
    state.loading.objectMeta[objectName] = true;

    state.vscode.postMessage({
        command: "requestObjectMeta",
        objectType: objectName,
        isTooling: state.isTooling
    });
}

export function resolveObjectMetadata(objectName, metadata) {
    state.objectMeta[objectName] = metadata;
    state.loading.objectMeta[objectName] = false;
}
/* ===============================
   Utilities
================================ */
export function toggleToolingMode(isTooling) {
    state.isTooling = isTooling;
    requestObjectsList(isTooling);
}

export function setCurrentObject(objectName) {
    state.lastObject = state.currentObject;
    state.currentObject = objectName;
}

export function initStateForPage(pageName) {
    state.pageName = pageName;
    requestObjectsList(true);
    requestObjectsList(false);
}

export function resetStateForOrgChange() {
    state.objects.standard = [];
    state.objects.tooling = [];
    state.objectMeta = Object.create(null);
    state.loading.objectMeta = Object.create(null);
}
