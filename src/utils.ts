import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import * as crypto from 'crypto';

const tempFilePath = path.join(getTempDir(), 'soql_assist_cached.json');

export function getTempDir() {
    return path.join(os.tmpdir(), 'soqlAssist');
}

async function ensureTempDir(): Promise<void> {
    await fs.mkdir(getTempDir(), { recursive: true });
}

export function safeParseJson(content: string) {
    try {
        return JSON.parse(content);
    } catch {
        return null;
    }
}

function hashCommand(command: string): string {
    return crypto.createHash('sha256').update(command).digest('hex');
}

function runCommandRaw(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { shell: true, windowsHide: true });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => (stdout += data.toString()));
        child.stderr.on('data', (data) => (stderr += data.toString()));
        child.on('error', reject);

        child.on('close', (code) => {
            if (code !== 0) {
                const output = safeParseJson(stdout.trim());
                return reject(new Error(`Error:${stderr}${output?.message}`));
            }
            resolve(stdout.trim());
        });
    });
}

export async function runCommand(command: string): Promise<string> {
    return runCommandRaw(command);
}

/**
 * Runs a command and saves the output to a temporary file.
 * If the command has been run before, it retrieves the cached output.
 * @param command The command to run.
 * @returns The path to the temporary file containing the command output.
 */
export async function runCommandToFile(command: string): Promise<string> {
    const res = await runCommandRaw(command);
    const filePath = await saveCommandOutput(command, res);
    return filePath;
}

export async function saveCommandOutput(command: string, value: any): Promise<string> {
    await ensureTempDir();
    const commandHash = hashCommand(command);

    try {
        let existingData: Record<string, string> = {};
        try {
            const content = await fs.readFile(tempFilePath, 'utf-8');
            existingData = safeParseJson(content) || {};
        } catch {
            console.log('File could not be found');
        }
        existingData[commandHash] = value;
        await fs.writeFile(tempFilePath, JSON.stringify(existingData, null, 2), 'utf-8');
        return tempFilePath;
    } catch {
        return tempFilePath;
    }
}

export async function getCommandOutput(command: string): Promise<string | null> {
    try {
        const content = await fs.readFile(tempFilePath, 'utf-8');
        const data = safeParseJson(content);
        if (!data) {
            return null;
        }
        return data[hashCommand(command)] ?? null;
    } catch {
        return null;
    }
}

// Supported HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Options for calling an API
export interface ApiOptions {
    method?: HttpMethod;
    headers?: Record<string, string>;
    params?: Record<string, string | number | boolean | undefined>;
    body?: any;
}

/**
 * Generic function to call REST APIs.
 * @param url - The API endpoint.
 * @param options - Optional method, headers, query params, and body.
 * @returns A typed Promise containing the response data.
 */
export async function callApi<T = any>(url: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', headers = {}, params, body } = options;

    // Convert query parameters to string
    const queryString = params
        ? '?' +
        Object.entries(params)
            .filter(([_, value]) => value !== undefined)
            .map(
                ([key, value]) =>
                    `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
            )
            .join('&')
        : '';

    const fullUrl = url + queryString;

    const fetchOptions: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
    }

    // Use fetch API (ensure polyfill for Node if needed)
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `API call failed: ${response.status} ${response.statusText} - ${errorText}`
        );
    }

    return response.json() as Promise<T>;
}

interface ErrorAction {
    label: string;
    command?: string;           // Optional VS Code command to run
    link?: string;              // Optional URL to open
}

export async function showErrorWithActions(message: string, actions: ErrorAction[] = []): Promise<void> {
    const actionLabels = actions.map(a => a.label);
    const result = await vscode.window.showErrorMessage(
        message,
        ...actionLabels,
        'Dismiss'
    );

    const selected = actions.find(a => a.label === result);
    if (selected) {
        if (selected.link) {
            vscode.env.openExternal(vscode.Uri.parse(selected.link));
        } else if (selected.command) {
            vscode.commands.executeCommand(selected.command);
        }
    }
}
