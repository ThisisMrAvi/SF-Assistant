import * as vscode from 'vscode';
import { PanelManager } from './panelManager';

export function activate(context: vscode.ExtensionContext) {
    const panelManager = new PanelManager(context);

    context.subscriptions.push(
        vscode.commands.registerCommand('sf-assistant.runSoqlQuery', async () => {
            await panelManager.createOrShow('soql');
        }),
        vscode.commands.registerCommand('sf-assistant.metaExplorer', async () => {
            await panelManager.createOrShow('meta');
        }),
        vscode.commands.registerCommand('sf-assistant.clearCache', async () => {
            panelManager.clearCache();
        })
    );
}

export function deactivate() { }