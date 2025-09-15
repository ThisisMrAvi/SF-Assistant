// src/salesforceService.ts
import { safeParseJson, runCommand, runCommandToFile, getCommandOutput, callApi } from './utils';

export async function getOrgInfo(): Promise<any> {
    try {
        const cmd = 'sf org display --json';
        // await runCommandToFile(cmd);
        // Read the temporary file created by runCommandToFile
        const data = await runCommand(cmd);
        if (!data) { return []; }
        const parsed = safeParseJson(data);
        return parsed.result || null;
    } catch (err) {
        console.error('[Salesforce Assistant] getOrgInfo error:', err);
        return null;
    }
}


export async function getObjectList(): Promise<string[]> {
    try {
        // sf sobject list --json
        const data = await runCommand(`sf sobject list --json`);
        const parsed = safeParseJson(data);
        if (!parsed) { return []; }
        // Depending on SF CLI, it may return result array or top-level array
        if (Array.isArray(parsed)) { return parsed; }
        if (parsed.result && Array.isArray(parsed.result)) { return parsed.result; }
        if (parsed.objects && Array.isArray(parsed.objects)) { return parsed.objects; }
        return parsed.result || [];
    } catch (err: any) {
        console.error('[Salesforce Assistant] getObjectList error:', err);
        return [];
    }
}

export async function getObjectDescribe(objectType: string, isTooling: boolean): Promise<any> {
    try {
        // sf sobject describe --sobject Account --json
        const cmd = `sf sobject describe --sobject ${objectType} ${isTooling ? '-t' : ''} --json`;
        // Run the command and get the output
        // await runCommandToFile(cmd);
        // Read the temporary file created by runCommandToFile
        const data = await runCommand(cmd);
        if (!data) { return null; }
        const parsedObj = safeParseJson(data);
        return parsedObj;
    } catch (err: any) {
        console.error(`[Salesforce Assistant] getObjectDescribe(${objectType}) error:`, err && err.message ? err.message : err);
        return [];
    }
}

export async function getObjectFields(objectType: string): Promise<string[]> {
    try {
        // sf sobject describe --sobject Account --json
        const cmd = `sf sobject describe --sobject ${objectType} --json`;
        // Run the command and get the output
        // await runCommandToFile(cmd);
        // Read the temporary file created by runCommandToFile
        const data = await runCommand(cmd);
        if (!data) { return []; }
        const parsed = safeParseJson(data);
        if (!parsed) { return []; }
        // parsed.result.fields -> array of field objects with 'name'
        const fields = (parsed.result && Array.isArray(parsed.result.fields))
            ? parsed.result.fields.map((f: any) => f.name)
            : [];
        return fields;
    } catch (err: any) {
        console.error(`[Salesforce Assistant] getObjectFields(${objectType}) error:`, err && err.message ? err.message : err);
        return [];
    }
}

export async function runSOQLQuery(query: string, isTooling: boolean = false): Promise<any> {
    try {
        // sf data query --query "SELECT Id, Name FROM Account LIMIT 1" --json
        // note: sf data query returns { result: { records: [...] } } or direct array depending on version; we normalize
        const escaped = query
            .replace(/\n/g, ' ')   // Replace newlines with space
            .replace(/"/g, '\\"'); // Escape double quotes

        const cmd = `sf data query --query "${escaped}"${isTooling ? ' -t' : ''} --json`;

        // Run the command and get the output
        // await runCommandToFile(cmd);
        // Read the temporary file created by runCommandToFile
        const data = await runCommand(cmd);
        if (!data) { return null; }
        const parsed = safeParseJson(data);
        if (!parsed) {
            throw new Error('Could not parse CLI output');
        }
        // If CLI returns result object with records, return result (so webview expects .records)
        if (parsed.result) { return parsed.result; }
        if (Array.isArray(parsed)) { return { records: parsed }; }
        return parsed;
    } catch (err: any) {
        console.error('[Salesforce Assistant] runSOQLQuery error:', err.message || err);
        throw err;
    }
}

/**
 * Calls a Salesforce REST API endpoint using the generic callApi helper.
 * @param endpoint - Full URL or relative Salesforce API path (e.g., /services/data/v57.0/sobjects/)
 * @param httpMethod - HTTP method to use (default: 'GET')
 * @param headers - Optional headers object, e.g., { Authorization: 'Bearer XXX' }
 * @param body - Optional request body (used for POST, PUT, PATCH, etc.)
 * @returns Parsed API response, or { records: [...] } if response is an array, or error if not parseable.
 */
export async function runRestAPI(endpoint: string, httpMethod: string = 'GET', headers: Record<string, string> = {}, body: any = undefined): Promise<any> {
    try {
        const data = await callApi<any>(endpoint, { method: httpMethod as any, headers, body: body });
        if (!data) {
            return null;
        }
        // If response is a JSON string, attempt to parse
        const parsed = typeof data === 'string' ? safeParseJson(data) : data;

        if (!parsed) {
            return { error: 'Could not parse API output' };
        }

        if (parsed.result) {
            return parsed.result;
        }
        if (Array.isArray(parsed)) {
            return { records: parsed };
        };

        return parsed;
    } catch (err: any) {
        console.error('[Salesforce Assistant] runRestAPI error:', err.message || err);
        throw err;
    }
}