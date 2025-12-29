# Salesforce Assistant

**Salesforce Assistant** is a Visual Studio Code extension that helps developers run and explore SOQL queries directly within VS Code. It provides a simple query editor, tabular result view, export options, and metadata tools — all without leaving your Salesforce project.

---

## ✨ Features

- 📝 Run **SOQL queries** directly from VS Code.
- 📊 View query results in a clean, interactive **table view** (webview).
- 🔍 Export data easily to **CSV** or **JSON**.
- 📁 Explore objects/Records/fields with the **Metadata Explorer**.
- 🧹 Clear cached metadata when needed
- 🔐 Automatically uses the **currently authenticated Salesforce org** (no extra setup).
- 🛠️ Configurable **cache TTL**.

---

## 📸 Demo

![SOQL Query Demo](https://github.com/ThisisMrAvi/SF-Assistant/blob/master/assets/sfassist_demo.gif?raw=true)

---

## 🔧 Requirements

- 🛠️ [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli) must be installed.
- You must be logged into an org via:
  ```bash
  sf login web
  # or
  sfdx force:auth:web:login
  ```
- 💻 A Salesforce project open in **VS Code**.

---

## 🚀 Usage

1. 🎯 Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`).
2. Run one of the following commands:
   - **`SF Assistant: Run SOQL Query`** → execute a query and view results.
   - **`SF Assistant: Metadata Explorer`** → browse objects, Records and fields.
   - **`SF Assistant: Clear Cache`** → clear cached metadata.
3. ✍️ Enter your SOQL query or browse metadata.
4. 👀 View results in the interactive table webview.
5. 📤 Use export buttons to download results as **CSV** or **JSON**.

##### Example query:

1. Simple query:

```sql
SELECT Id, Name, Type FROM Account WHERE CreatedDate = LAST_N_DAYS:30 LIMIT 10
```

2. Aggregate Query:

```sql
SELECT COUNT(Id), Type FROM Account GROUP BY Type LIMIT 10
```

3. Nested Query:

```sql
SELECT Id, Name, (SELECT Id, StageName FROM Opportunities)
FROM Account
WHERE CreatedDate = LAST_N_DAYS:30
LIMIT 10
```

---

## ⌨️ Keyboard Shortcuts (Keybindings)

You can configure your own shortcuts in VS Code under  
`File → Preferences → Keyboard Shortcuts` (`Ctrl+K Ctrl+S`).

In SOQL Query editor window:

1.  Ctrl + Enter to run query
2.  Ctrl + Space to insert all shown suggestions

---

## ⚙️ Extension Settings

This extension contributes the following settings:

| Setting                 | Type     | Default | Description                                                         |
| ----------------------- | -------- | ------- | ------------------------------------------------------------------- |
| `sf-assistant.cacheTTL` | `number` | `12`    | Time (in hours) to cache metadata (objects, fields, relationships). |

You can update these in VS Code **settings.json**:

```json
{
  "sf-assistant.cacheTTL": 12
}
```

---

## 🐞 Known Issues

- Only supports **default org authentication**.
- Very large result sets may cause performance issues in the table view.

---

## 🛣️ Roadmap

Planned enhancements for upcoming releases:

- 🎨 **UI improvements**: better formatting, theming, and table controls.
- 🔄 **Data Load**: Create/Update/Delete records directly from the extension.
- ⚡ **Performance optimizations** for large datasets.
- 🧩 **Custom Settings** for query limits, formatting, and exports.

_Suggestions and feedback are welcome to help shape future versions._

---

## 📚 References

- [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

---

## 🙏 Acknowledgements

This extension was inspired by the functionality and user experience of  
[Salesforce Inspector](https://github.com/superfell/inspector) and  
[Salesforce Inspector Reloaded](https://github.com/mohancm/salesforce-inspector-reloaded).  
Big thanks to the creators and community for their contributions!

---

💡 **Tip:** Keep your queries short and filtered to avoid hitting Salesforce limits or slowing down VS Code.

---

**Enjoy using Salesforce Assistant! 🎉**
