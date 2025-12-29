# Change Log

All notable changes to the "sf-assistant" extension will be documented in this file.

<!-- Check [Keep a Changelog](https://keepachangelog.com/) for recommendations on how to structure this file. -->

## [2.2.0]

### Added

- **Data Import** — Insert, update, upsert, delete and undelete Salesforce records directly from the extension.
- **Copy Result** — Quickly copy import job results with a single click.

### Fixed

- Improved overall performance and stability.
- Resolved an issue where only the first 50 records were displayed in some cases.
- Fixed minor bugs and UI inconsistencies.

## [2.1.2]

### Fixed

- Fixed minor bug

## [2.1.0]

### Added

- **Recent Queries** — View your last 10 executed queries directly from the dropdown.
- **Attribute Visibility Toggle** — Added an option to show or hide attributes for a cleaner view.
- **Copy Result** — Added an option to copy exported query results quickly and easily.
- **Org Info** - Added Org details in settings panel.

### Fixed

- Improved overall performance and resolved memory leaks.
- Fixed several minor bugs and UI inconsistencies.

## [2.0.0]

### Added

- **Metadata Explorer**: browse object metadata, fields, and child relationships.
- **Navigation sidebar**: switch between SOQL Query and Metadata Explorer without reloading.

### Fixed

- Resolved issues in SOQL Query editor.
- Fixed value suggestions for picklist

## [1.0.0]

### Added

- Initial release
- Support for running **SOQL queries** directly within VS Code.
- Interactive **table view** (webview) to display query results.
- Ability to **export results** to CSV or JSON formats.
- Option to **clear cached metadata** to refresh schema definitions.
- Automatically connects to the **currently authenticated Salesforce org** (no manual setup required).
- Settings to configure **data cache duration**.
