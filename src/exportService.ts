import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getTempDir } from './utils';

export function saveFileToWorkspace(content: string, filename: string, ext: string) {
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }
    const filePath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, `${filename}.${ext}`);
    fs.writeFileSync(filePath, content);
    vscode.window.showInformationMessage(`Exported to ${filePath}`);
}

export function saveFileToTempAndOpen(content: string, filename: string, ext: string) {
    const tempDir = getTempDir();
    const filePath = path.join(tempDir, `${filename}.${ext}`);
    fs.writeFileSync(filePath, content, 'utf8');
    vscode.workspace.openTextDocument(filePath).then(doc => vscode.window.showTextDocument(doc));
}
