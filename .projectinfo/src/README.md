# Source Code Documentation

## Core Files

### extension.ts

Main extension entry point that registers commands and activates features.

### panelManager.ts

Manages webview panels and handles communication between VS Code and webviews.

### salesforceService.ts

Provides Salesforce API integration services including:

- SOQL query execution
- Object metadata retrieval
- REST API calls

### cliValidationService.ts

Validates Salesforce CLI installation and org authentication.

### utils.ts

Shared utility functions for file operations, command execution, etc.

### DataType.ts

TypeScript type definitions for Salesforce metadata.

## Architecture

- Uses TypeScript
- Follows VS Code extension guidelines
- Implements webview-based UI
