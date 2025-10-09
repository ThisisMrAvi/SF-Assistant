// src/panelManager.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOrgInfo, getObjectDescribe, runSOQLQuery, getObjectList, runRestAPI } from './salesforceService';
import { saveFileToWorkspace } from './exportService';
import { CacheManager } from './cacheManager';

export class PanelManager {

    // Shared across all panels
    private static panels: Map<string, vscode.WebviewPanel> = new Map();
    private static iconMap: Record<string, string> = {};
    private static cliValidated: boolean = false;
    private static cache: CacheManager = CacheManager.getInstance(
        vscode.workspace.getConfiguration('sf-assistant').get<number>('cacheTTL', 12)
    );
    private static API_VERSION: number = vscode.workspace.getConfiguration('sf-assistant').get<number>('apiVersion', 60.0);

    // Instance-specific
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Create or reveal a panel of type 'soql-panel' or 'meta-explorer'
     */
    public async createOrShow(pageName: string) {
        const title = pageName === 'soql-panel' ? 'SOQL Query' : 'Metadata Explorer';
        let panel = PanelManager.panels.get(pageName);

        if (panel) {
            panel.reveal(vscode.ViewColumn.One);
            return;
        }

        panel = vscode.window.createWebviewPanel(
            `sfAssistant-${pageName}`,
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                enableFindWidget: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'scripts'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'webview'),
                ],
            }
        );

        PanelManager.panels.set(pageName, panel);

        panel.onDidDispose(() => {
            PanelManager.panels.delete(pageName);
        });

        // URIs for scripts and styles
        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'scripts', 'main.js')
        );
        const styleUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'style.css')
        );

        // Load main.html
        const htmlPath = path.join(this.context.extensionUri.fsPath, 'webview', 'main.html');
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Inject URIs
        html = html
            .replace(/\$\{scriptUri\}/g, scriptUri.toString())
            .replace(/\$\{styleUri\}/g, styleUri.toString())
            .replace(/<title>.*<\/title>/, `<title>${title}</title>`);

        // Inject CSP
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} https: data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src ${panel.webview.cspSource}; font-src ${panel.webview.cspSource} data:;">`;
        html = html.replace(/<head>/i, `<head>\n${cspMeta}`);

        panel.webview.html = html;

        this.validateCli(panel);
        this.getIconMap(panel);
        this.loadPage(panel, pageName);

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(async (message) => {
            try {
                if (!PanelManager.cliValidated) {
                    await this.validateCli(panel);
                    return;
                }
                switch (message.command) {
                    // Dynamic page injection
                    case 'loadPage': {
                        this.loadPage(panel, message.pageName);
                        break;
                    }
                    case 'requestObjectList':
                        await this.fetchObjectList(panel, 'standard');
                        break;
                    case 'requestToolingObjectList':
                        await this.fetchObjectList(panel, 'tooling');
                        break;
                    case 'requestObjectMeta':
                        await this.handleObjectMetaRequest(panel, message.objectType, message.isTooling);
                        break;
                    case 'runQuery':
                        this.updateRecentQueries(panel, message.query, message.isTooling);
                        await this.context.workspaceState.update('isTooling', message.isTooling);
                        await this.handleRunQuery(panel, message.query, message.isTooling);
                        break;
                    case 'saveQuery':
                        await this.handleSaveQuery(panel, message.label, message.query);
                        break;
                    case 'deleteQuery':
                        await this.handleDeleteQuery(panel, message.label);
                        break;
                    case 'exportCSV':
                        saveFileToWorkspace(message.content, this.getFileName(message.obj), 'csv');
                        break;
                    case 'exportJSON':
                        saveFileToWorkspace(JSON.stringify(message.content, null, 2), this.getFileName(message.obj), 'json');
                        break;
                    default:
                        console.warn('[Salesforce Assistant] Unknown message from webview', message);
                }
            } catch (err: any) {
                panel?.webview.postMessage({ command: 'error', message: err.message || String(err), stack: err.stack || '' });
            }
        });
    }

    public clearCache() {
        PanelManager.cache.clear();
        vscode.window.showInformationMessage('Salesforce Assistant cache cleared');
    }

    /**
     * getFileName
     */
    public getFileName(obj: string) {
        return `soql_result_${obj ? '_' + obj : ''}${Date.now()}`;
    }

    private loadPage(panel: vscode.WebviewPanel, pageName: string) {
        const pageNameFull = `${pageName}.html`;
        const contentHtml = getWebviewContent(panel, this.context, pageNameFull);
        panel.webview.postMessage({ command: 'injectPage', pageName: pageName, html: contentHtml });
        if (pageName === 'soql-panel') {
            // Initialize after short delay
            setTimeout(() => {
                this.handleLazyLoadSoql(panel);
            }, 500);
            panel.title = 'SOQL Query';
        } else if (pageName === 'meta-explorer') {
            // Initialize after short delay
            setTimeout(() => {
                this.handleLazyLoadMeta(panel);
            }, 500);
            panel.title = 'Metadata Explorer';
        }
    }

    private getIconMap(panel: vscode.WebviewPanel) {
        if (Object.keys(PanelManager.iconMap).length > 0) {
            panel.webview.postMessage({ command: 'iconMap', iconMap: PanelManager.iconMap });
            return;
        }
        //Create icon map for field types
        const iconsFolderUri = vscode.Uri.joinPath(this.context.extensionUri, 'assets', 'icons');
        const fieldTypes = [
            'object',
            'string',
            'boolean',
            'picklist',
            'multipicklist',
            'reference',
            'url',
            'currency',
            'number',
            'address',
            'date',
            'datetime',
            'time',
            'phone',
            'email',
            'formula',
            'summary',
        ];
        const customMap: Record<string, string> = {
            datetime: 'date',
            multipicklist: 'picklist',
        };
        for (const fieldType of fieldTypes) {
            const icon = customMap[fieldType] || fieldType;
            const iconPath = vscode.Uri.joinPath(iconsFolderUri, `${icon}.svg`);
            PanelManager.iconMap[fieldType] =
                panel.webview.asWebviewUri(iconPath).toString() || '';
        }

        panel.webview.postMessage({ command: 'iconMap', iconMap: PanelManager.iconMap });
    }

    private async handleRunQuery(panel: vscode.WebviewPanel, query: string, isTooling: boolean) {
        const start = Date.now();
        try {
            const result = await runSOQLQuery(query, isTooling);
            const time = ((Date.now() - start) / 1000).toFixed(2);
            if (result.error?.data?.errorCode) {
                panel.webview.postMessage({ command: 'error', message: result.error.data.message || 'Unknown error' });
                return;
            }
            panel.webview.postMessage({ command: 'showResult', data: result, rowCount: result.records?.length || 0, time });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err), stack: err.stack || '' });
        }
    }

    private async updateRecentQueries(panel: vscode.WebviewPanel, query: string, isTooling: boolean = false) {
        const recentQueries = this.context.workspaceState.get<Array<string>>('recentQueries') || [];
        if (!query) {
            panel.webview.postMessage({ command: 'restoreState', queries: recentQueries, isTooling });
            return;
        }
        // prevent duplicate labels
        const normalizedQuery = query.toLowerCase();
        const queryIndex = recentQueries.findIndex(
            item => item.toLowerCase() === normalizedQuery
        );
        if (queryIndex !== -1) {
            recentQueries.splice(queryIndex, 1);
        }
        recentQueries.unshift(query);

        // limit history to 10
        if (recentQueries.length > 10) {
            recentQueries.pop();
        }
        await this.context.workspaceState.update('recentQueries', recentQueries);
        panel.webview.postMessage({ command: 'recentQueries', queries: recentQueries });
    }

    private async handleSaveQuery(panel: vscode.WebviewPanel, label: string, query: string) {
        const saved = this.context.globalState.get<{ label: string; query: string }[]>('savedQueries') || [];
        // optional: prevent duplicate labels
        if (saved.some((s) => s.label === label)) {
            panel.webview.postMessage({ command: 'error', message: `Label "${label}" already exists` });
            return;
        }
        saved.push({ label, query });
        await this.context.globalState.update('savedQueries', saved);
        panel.webview.postMessage({ command: 'savedQueries', queries: saved });
    }

    private async handleDeleteQuery(panel: vscode.WebviewPanel, label: string) {
        let saved = this.context.globalState.get<{ label: string; query: string }[]>('savedQueries') || [];
        saved = saved.filter(s => s.label !== label);
        await this.context.globalState.update('savedQueries', saved);
        panel.webview.postMessage({ command: 'savedQueries', queries: saved });
    }

    private async handleObjectMetaRequest(panel: vscode.WebviewPanel, objectType: string, isTooling: boolean = false) {
        if (!objectType) {
            panel.webview.postMessage({ command: 'objectMeta', objMeta: {} });
            return;
        }

        // Try to get from cache first
        const cachedMeta = PanelManager.cache.get(`objectMeta-${objectType}`, isTooling ? 'tooling' : 'standard');
        if (cachedMeta) {
            panel.webview.postMessage({ command: 'objectMeta', objMeta: cachedMeta });
            return;
        }

        try {
            const objMeta = await getObjectDescribe(objectType, isTooling);
            if (!objMeta?.result) {
                panel.webview.postMessage({ command: 'error', message: `Failed to describe object "${objectType}"` });
                return;
            }

            // Store in cache
            PanelManager.cache.set(
                `objectMeta-${objectType}`,
                objMeta.result,
                isTooling ? 'tooling' : 'standard'
            );

            panel.webview.postMessage({ command: 'objectMeta', objMeta: objMeta.result });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err), stack: err.stack || '' });
        }
    }

    // Check Salesforce CLI installation and default org
    private async validateCli(panel: vscode.WebviewPanel) {
        const cliValidation = await import('./cliValidationService');
        const cliValidationService = cliValidation.CliValidationService;
        const cliInstalled = await cliValidationService.isCliInstalled();
        const orgSet = cliInstalled ? await cliValidationService.isDefaultOrgSet() : false;
        PanelManager.cliValidated = cliInstalled && orgSet;

        if (!cliInstalled || !orgSet) {
            panel.webview.postMessage({ command: 'error', message: 'Salesforce CLI not installed or default org not set.' });
            await cliValidationService.showValidationError(cliInstalled, orgSet);
            return;
        }

        this.getOrgInfo(panel);
        this.fetchObjectList(panel, 'standard');
    }

    private handleLazyLoadSoql(panel: vscode.WebviewPanel) {
        const saved = this.context.globalState.get<{ label: string; query: string }[]>('savedQueries') || [];
        const isTooling = this.context.workspaceState.get<boolean>('isTooling');
        panel.webview.postMessage({ command: 'savedQueries', queries: saved });
        this.updateRecentQueries(panel, '', isTooling);
        isTooling ? this.fetchObjectList(panel, 'tooling') : this.fetchObjectList(panel, 'standard');
    }

    private handleLazyLoadMeta(panel: vscode.WebviewPanel) {
        this.fetchObjectList(panel, 'standard');
    }

    private async getOrgInfo(panel: vscode.WebviewPanel) {
        const cachedOrgInfo = PanelManager.cache.get('orgInfo');
        if (cachedOrgInfo) {
            panel.webview.postMessage({ command: 'orgInfo', orgInfo: cachedOrgInfo });
            return;
        }

        const orgInfo = await getOrgInfo();
        if (orgInfo) {
            PanelManager.cache.set('orgInfo', orgInfo);
            panel.webview.postMessage({ command: 'orgInfo', orgInfo });
        }
    }

    // private async getOrgObjects() {
    //     const now = Date.now();
    //     if (this.objectsCache.data.length && now - this.objectsCache.timestamp < this.CACHE_TTL_MS) {
    //         return this.objectsCache.data;
    //     }
    //     try {
    //         const objects = await getObjectList();
    //         this.objectsCache = { data: objects, timestamp: now };
    //         return this.objectsCache.data;
    //     } catch (err: any) {
    //         PanelManager.panel?.webview.postMessage({ command: 'error', message: err.message || String(err), stack: err.stack || '' });
    //     }
    // }

    private async fetchObjectList(panel: vscode.WebviewPanel, objType: 'standard' | 'tooling') {
        const webviewCommand = objType === 'tooling' ? 'toolingObjectsList' : 'objectsList';
        const cacheKey = `objectsList-${objType}`;

        // Try to get from cache first
        const cachedObjects = PanelManager.cache.get(cacheKey);
        if (cachedObjects) {
            panel.webview.postMessage({ command: webviewCommand, objects: cachedObjects });
            return;
        }

        try {
            // Get org info from cache or fetch it
            const orgInfo = PanelManager.cache.get('orgInfo') || await getOrgInfo();
            if (!orgInfo) {
                panel.webview.postMessage({ command: 'error', message: 'Failed to get org info' });
                return;
            }

            const baseUrl = <string>orgInfo.instanceUrl;
            const accessToken = <string>orgInfo.accessToken;
            const headers = { Authorization: `Bearer ${accessToken}` };

            const endpoint = objType === 'tooling'
                ? `${baseUrl}/services/data/v${PanelManager.API_VERSION.toFixed(1)}/tooling/sobjects/`
                : `${baseUrl}/services/data/v${PanelManager.API_VERSION.toFixed(1)}/sobjects/`;

            const result = await runRestAPI(endpoint, 'GET', headers);

            // Store in cache
            PanelManager.cache.set(cacheKey, result.sobjects, objType);

            panel.webview.postMessage({ command: webviewCommand, objects: result.sobjects });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err), stack: err.stack || '' });
        }
    }
}

/**
 * Returns HTML content of a page with all relative resources converted to webview-safe URIs.
 * Used for dynamic injection inside #content div.
 */
function getWebviewContent(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, pageName: string) {
    const fileUri = vscode.Uri.joinPath(context.extensionUri, 'webview', pageName);
    const html = fs.readFileSync(fileUri.fsPath, 'utf8');
    return html
        .replace(/src="(.+?)"/g, (_, src) => {
            return `src="${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', src))}"`;
        })
        .replace(/href="(.+?)"/g, (_, href) => {
            return `href="${panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', href))}"`;
        });
}
