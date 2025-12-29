// src/panelManager.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { hash, randomUUID } from 'crypto';
import { getOrgInfo, getObjectList, getObjectDescribe, runSOQLQuery, getRecordDescribe } from './services/salesforceService';
import { requestDedup } from './services/requestDeduplicationManager';
import { DataLoadService } from './services/dataLoadService';
import { CacheManager } from './cacheManager';
import { saveFileToWorkspace } from './services/exportService';

export class PanelManager {

    // Shared across all panels - map panelId to panel reference
    private static panels: Map<string, vscode.WebviewPanel> = new Map();
    private static iconMap: Record<string, string> = {};
    private static cliValidated: boolean = false;
    private static cache: CacheManager = CacheManager.getInstance(
        vscode.workspace.getConfiguration('sf-assistant').get<number>('cacheTTL', 12)
    );
    private static dataLoadCancelled: boolean = false;

    // Instance-specific
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Create or reveal a panel of type 'data-export', 'meta-explorer', or 'data-import'
     */
    public async createOrShow(pageName: string) {
        const titleMap: Record<string, string> = {
            'data-export': 'Data Export',
            'meta-explorer': 'Metadata Explorer',
            'data-import': 'Data Load',
        };
        let panel = vscode.window.createWebviewPanel(
            `sfAssistant-${pageName}`,
            titleMap[pageName] || 'SF Assistant',
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

        // Generate unique ID for this panel and attach to panel object
        const panelId = randomUUID();
        (panel as any).__panelId = panelId;
        PanelManager.panels.set(panelId, panel);

        panel.onDidDispose(() => {
            PanelManager.panels.delete(panelId);
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
            .replace(/<title>.*<\/title>/, `<title>${titleMap[pageName]}</title>`);

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
                    case 'requestOrgMeta':
                        await this.getOrgInfo(panel);
                        break;
                    case 'requestObjectList':
                        await this.fetchObjectList(panel, 'standard');
                        break;
                    case 'requestToolingObjectList':
                        await this.fetchObjectList(panel, 'tooling');
                        break;
                    case 'requestObjectMeta':
                        await this.handleObjectMetaRequest(panel, message.objectType, message.isTooling);
                        break;
                    case 'requestRecordMeta':
                        await this.handleRecordMetaRequest(panel, message.recordId, message.objectType, message.isTooling);
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
                        const csvFileName = panel.title.replace(/\s+/g, '_').toLowerCase();
                        saveFileToWorkspace(message.content, `${csvFileName}_${Date.now()}`, 'csv');
                        break;
                    case 'exportJSON':
                        const jsonFileName = panel.title.replace(/\s+/g, '_').toLowerCase();
                        saveFileToWorkspace(JSON.stringify(message.content, null, 2), `${jsonFileName}_${Date.now()}`, 'json');
                        break;
                    case 'runDataLoad':
                        PanelManager.dataLoadCancelled = false;
                        await this.handleDataLoad(panel, message);
                        break;
                    case 'cancelDataLoad':
                        PanelManager.dataLoadCancelled = true;
                        panel.webview.postMessage({ command: 'error', message: 'Data load operation cancelled' });
                        break;
                    default:
                        console.warn('[Salesforce Assistant] Unknown message from webview', message);
                }
            } catch (err: any) {
                panel?.webview.postMessage({ command: 'error', message: err.message || String(err) });
            }
        });
    }

    public clearCache() {
        PanelManager.cache.clear();
        vscode.window.showInformationMessage('Salesforce Assistant cache cleared');
    }

    private loadPage(panel: vscode.WebviewPanel, pageName: string) {
        const pageNameFull = `${pageName}.html`;
        const contentHtml = getWebviewContent(panel, this.context, pageNameFull);
        panel.webview.postMessage({ command: 'injectPage', pageName: pageName, html: contentHtml });
        if (pageName === 'data-export') {
            // Initialize after short delay
            setTimeout(() => {
                this.handleLazyLoad(panel);
            }, 500);
            panel.title = 'Data Export';
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
            const panelId = (panel as any).__panelId;
            const dedupeKey = `run-query-${hash('sha1', query)}-${isTooling}`;

            // Subscribe this panel to the request
            requestDedup.subscribeToRequest(dedupeKey, panelId);

            // Use request deduplication: same query won't execute multiple times simultaneously
            const result = await requestDedup.executeOnce(dedupeKey, async () => {
                return await runSOQLQuery(query, isTooling);
            });

            // Broadcast to all panels that requested this data
            const subscribers = requestDedup.getSubscribers(dedupeKey);
            subscribers.forEach(subscriberPanelId => {
                const subscriberPanel = PanelManager.panels.get(subscriberPanelId);
                if (subscriberPanel) {
                    subscriberPanel.webview.postMessage({
                        command: 'showResult',
                        data: result,
                        rowCount: result.records?.length || 0,
                        time: ((Date.now() - start) / 1000).toFixed(2),
                    });
                }
            });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'exportError', message: err.message || String(err), cause: err.cause || null });
        } finally {
            const panelId = (panel as any).__panelId;
            const dedupeKey = `run-query-${query}-${isTooling ? 'tooling' : 'standard'}`;
            requestDedup.clearSubscribers(dedupeKey);
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
            const panelId = (panel as any).__panelId;
            const dedupeKey = `fetch-objectMeta-${objectType}-${isTooling ? 'tooling' : 'standard'}`;

            // Subscribe this panel to the request
            requestDedup.subscribeToRequest(dedupeKey, panelId);

            // Use request deduplication: if another request for same object is in flight, wait for it
            const objMeta = await requestDedup.executeOnce(dedupeKey, async () => {
                return await getObjectDescribe(objectType, isTooling);
            });

            if (!objMeta) {
                panel.webview.postMessage({ command: 'error', message: `Failed to describe object "${objectType}"` });
                return;
            }

            // Store in cache
            PanelManager.cache.set(
                `objectMeta-${objectType}`,
                objMeta,
                isTooling ? 'tooling' : 'standard'
            );

            // Broadcast to all panels that requested this data
            const subscribers = requestDedup.getSubscribers(dedupeKey);
            subscribers.forEach(subscriberPanelId => {
                const subscriberPanel = PanelManager.panels.get(subscriberPanelId);
                if (subscriberPanel) {
                    subscriberPanel.webview.postMessage({ command: 'objectMeta', objMeta: objMeta });
                }
            });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err) });
        } finally {
            const panelId = (panel as any).__panelId;
            const dedupeKey = `fetch-objectMeta-${objectType}-${isTooling ? 'tooling' : 'standard'}`;
            requestDedup.clearSubscribers(dedupeKey);
        }
    }

    private async handleRecordMetaRequest(panel: vscode.WebviewPanel, recordId: string, objectType: string, isTooling: boolean = false) {
        if (!recordId && !objectType) {
            panel.webview.postMessage({ command: 'recordMeta', objMeta: {} });
            return;
        }

        try {
            const panelId = (panel as any).__panelId;
            // Fetch record metadata via SOQL
            const dedupeKey = `fetch-record-${recordId}-${objectType}-${isTooling ? 'tooling' : 'standard'}`;

            // Subscribe this panel to the request
            requestDedup.subscribeToRequest(dedupeKey, panelId);

            // Use request deduplication: same record won't be fetched multiple times simultaneously
            const recMeta = await requestDedup.executeOnce(dedupeKey, async () => {
                return await getRecordDescribe(recordId, objectType, isTooling);
            });

            // Broadcast to all panels that requested this data
            const subscribers = requestDedup.getSubscribers(dedupeKey);
            subscribers.forEach(subscriberPanelId => {
                const subscriberPanel = PanelManager.panels.get(subscriberPanelId);
                if (subscriberPanel) {
                    subscriberPanel.webview.postMessage({ command: 'recordMeta', recordData: recMeta });
                }
            });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err) });
        } finally {
            const panelId = (panel as any).__panelId;
            const dedupeKey = `fetch-record-${recordId}-${objectType}-${isTooling ? 'tooling' : 'standard'}`;
            requestDedup.clearSubscribers(dedupeKey);
        }
    }

    // Check Salesforce CLI installation and default org
    private async validateCli(panel: vscode.WebviewPanel) {
        const cliValidation = await import('./services/cliValidationService');
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
    }

    private handleLazyLoad(panel: vscode.WebviewPanel) {
        const saved = this.context.globalState.get<{ label: string; query: string }[]>('savedQueries') || [];
        const isTooling = this.context.workspaceState.get<boolean>('isTooling');
        panel.webview.postMessage({ command: 'savedQueries', queries: saved });
        this.updateRecentQueries(panel, '', isTooling);
    }

    private async getOrgInfo(panel: vscode.WebviewPanel) {
        try {
            // Try to get from PanelManager cache first
            const cachedOrgInfo = PanelManager.cache.get('orgInfo');
            if (cachedOrgInfo) {
                console.log('[SF Assistant] Using cached org info from PanelManager');
                panel.webview.postMessage({ command: 'orgInfo', orgInfo: cachedOrgInfo });
                return;
            }

            const panelId = (panel as any).__panelId;
            const dedupeKey = 'fetch-orgInfo';

            // Subscribe this panel to the request
            requestDedup.subscribeToRequest(dedupeKey, panelId);

            // Use request deduplication: prevent concurrent org info fetches
            const orgInfo = await requestDedup.executeOnce(dedupeKey, async () => {
                return await getOrgInfo();
            });

            if (orgInfo) {
                // Store in PanelManager cache for persistence
                PanelManager.cache.set('orgInfo', orgInfo);
                console.log('[SF Assistant] Org info cached and sent to webview');

                // Broadcast to all panels that requested this data
                const subscribers = requestDedup.getSubscribers(dedupeKey);
                subscribers.forEach(subscriberPanelId => {
                    const subscriberPanel = PanelManager.panels.get(subscriberPanelId);
                    if (subscriberPanel) {
                        subscriberPanel.webview.postMessage({ command: 'orgInfo', orgInfo });
                    }
                });
            }
        } catch (err: any) {
            console.error('[SF Assistant] Failed to get org info:', err);
            panel.webview.postMessage({ command: 'error', message: `Failed to get org info: ${err.message}` });
        } finally {
            const dedupeKey = 'fetch-orgInfo';
            requestDedup.clearSubscribers(dedupeKey);
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
    //         PanelManager.panel?.webview.postMessage({ command: 'error', message: err.message || String(err) });
    //     }
    // }

    private async fetchObjectList(panel: vscode.WebviewPanel, objType: 'standard' | 'tooling') {
        const webviewCommand = objType === 'tooling' ? 'toolingObjectsList' : 'objectsList';
        const cacheKey = `objectsList`;
        const namespace = objType;
        const dedupeKey = `fetch-objectList-${objType}`;

        // Try to get from cache first
        const cachedObjects = PanelManager.cache.get(cacheKey, namespace);
        if (cachedObjects) {
            panel.webview.postMessage({ command: webviewCommand, objects: cachedObjects });
            return;
        }

        try {
            const panelId = (panel as any).__panelId;

            // Subscribe this panel to the request
            requestDedup.subscribeToRequest(dedupeKey, panelId);

            // Use request deduplication: if another request for same resource is in flight, wait for it
            const result = await requestDedup.executeOnce(dedupeKey, async () => {
                // Get org info from cache or fetch it
                const orgInfo = PanelManager.cache.get('orgInfo') || await getOrgInfo();
                if (!orgInfo) {
                    throw new Error('Failed to get org info');
                }
                return await getObjectList(objType === 'tooling');
            });

            // Store in cache
            PanelManager.cache.set(cacheKey, result, namespace);

            // Broadcast to all panels that requested this data
            const subscribers = requestDedup.getSubscribers(dedupeKey);
            subscribers.forEach(subscriberPanelId => {
                const subscriberPanel = PanelManager.panels.get(subscriberPanelId);
                if (subscriberPanel) {
                    subscriberPanel.webview.postMessage({ command: webviewCommand, objects: result });
                }
            });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err) });
        } finally {
            const panelId = (panel as any).__panelId;
            const dedupeKey = `fetch-objectList-${objType}`;
            requestDedup.clearSubscribers(dedupeKey);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Data Load                                                          */
    /* ------------------------------------------------------------------ */

    private async handleDataLoad(panel: vscode.WebviewPanel, msg: any) {
        const {
            actionType,
            objectName,
            data,
            batchSize
        } = msg;

        const records = this.parseInputData(data);
        if (!records.length) {
            throw new Error('No records found in input');
        }

        const startTime = Date.now();

        try {
            // Process in batches
            const results: any[] = [];
            const batchCount = Math.ceil(records.length / batchSize);

            for (let batchNum = 0; batchNum < batchCount; batchNum++) {
                // Check if cancellation was requested
                if (PanelManager.dataLoadCancelled) {
                    console.log('[Data Load] Operation cancelled by user');
                    panel.webview.postMessage({ command: 'error', message: 'Data load operation cancelled by user' });
                    break;
                }

                const start_idx = batchNum * batchSize;
                const end_idx = Math.min((batchNum + 1) * batchSize, records.length);
                const batch = records.slice(start_idx, end_idx);

                // Process batch based on action type
                const batchResults = await DataLoadService.process(
                    actionType,
                    objectName,
                    batch
                );

                // Add original record index to results for tracking
                const resultsWithIndex = batchResults.map((result, idx) => ({
                    ...result,
                    index: start_idx + idx,
                }));

                results.push(...resultsWithIndex);

                panel.webview.postMessage({
                    command: 'dataLoadProgress', progress: {
                        current: end_idx,
                        total: records.length,
                        batchNumber: batchNum + 1,
                        batchCount,
                        batchResults: resultsWithIndex
                    }
                });
            }

            const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            panel.webview.postMessage({
                command: 'dataLoadResult',
                results,
                summary: {
                    total: records.length,
                    successful: successCount,
                    failed: failCount,
                    time: totalTime,
                },
            });
        } catch (err: any) {
            panel.webview.postMessage({ command: 'error', message: err.message || String(err) });
        }
    }

    /* ------------------------------------------------------------------ */
    /* Utilities                                                          */
    /* ------------------------------------------------------------------ */

    private parseInputData(raw: string): any[] {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
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
