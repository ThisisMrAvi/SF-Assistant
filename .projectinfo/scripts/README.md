# Frontend Scripts Documentation

## Core Modules

### main.js

Entry point for browser-side code, handles:

- DOM initialization
- Page routing
- Message handling

### state.js

Manages shared state including:

- VS Code API bridge
- Object metadata cache
- UI state

### dom.js

Centralizes DOM element references and initialization

### utils.js

Browser-side utilities for:

- Event handling
- Data formatting
- Copy operations

### messaging.js

Handles communication with VS Code extension host

## Feature Modules

### queryActions.js

SOQL query execution and management

### metaActions.js

Metadata explorer functionality

### suggestions.js

Autocomplete system for SOQL editor

### results.js

Query results display and export
