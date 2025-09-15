// === Shared State ===
export const state = {

    vscode: acquireVsCodeApi(),
    orgInfo: {},
    iconMap: {},
    // objectFieldMap: {}, // To be replaced with objectMeta
    pageName: '',
    objectMeta: {},
    objectsList: [],
    toolingObjectsList: [],
    suggestionVisible: false,
    selectedSuggestionIndex: -1,
    currentObject: '',
    lastObject: '',
    token: '',
    isTooling: false,
};

// Operators by field type
export const operatorSuggestions = {
    string: ["=", "!=", "LIKE", "IN", "NOT IN"],
    boolean: ["=", "!="],
    int: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    double: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    currency: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    date: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    datetime: ["=", "!=", ">", "<", ">=", "<=", "IN", "NOT IN"],
    reference: ["=", "!="],
    multipicklist: ["INCLUDES", "EXCLUDES"],
    picklist: ["=", "!="],
    id: ["=", "!="]
};

// Salesforce Date Literals
export const dateLiterals = [
    `'${new Date().toISOString()}'`,
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
];
