// src/salesforceService.ts
import { callApi, ApiOptions, runCommand } from '../utils';
import type { ObjectDescribe, OrgDescribe } from '../types/salesforceDescribe';


// In-flight resolution promise (prevents concurrent CLI calls)
let resolvingOrg: Promise<OrgDescribe> | null = null;

// Cache configuration
const ORG_CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour - access tokens are usually valid for hours

export async function getOrgInfo(): Promise<OrgDescribe> {
    // If a resolution is already in progress, wait for it
    if (resolvingOrg) {
        return resolvingOrg;
    }

    resolvingOrg = (async () => {
        try {
            // Get org info from Salesforce CLI (canonical source)
            return await getOrgInfoFromCli();
        } catch (error: any) {
            console.error('[SF Assistant] Failed to get org info from CLI:', error);
            throw new Error(
                `Unable to resolve Salesforce connection.\n\n` +
                `Make sure:\n` +
                `1. Salesforce CLI is installed (https://developer.salesforce.com/tools/salesforcecli)\n` +
                `2. You are logged in: run 'sf org list' in terminal\n` +
                `3. A default org is set: run 'sf config set target-org <orgname>'\n\n` +
                `Error: ${error.message}`
            );
        } finally {
            // Clear the promise so next call will trigger a fresh fetch
            resolvingOrg = null;
        }
    })();

    return resolvingOrg;
}

/**
 * Get org info using Salesforce CLI (canonical source)
 * Caching is handled by PanelManager.cache
 */
async function getOrgInfoFromCli(): Promise<OrgDescribe> {
    try {
        // Get the default org info from CLI
        const result = await runCommand('sf org display --json');
        const parsed = JSON.parse(result);

        if (!parsed.result) {
            throw new Error('No org is set as default. Please set a default org using "sf config set target-org <orgname>".');
        }
        // typecast to OrgDescribe
        const orgInfo: OrgDescribe = parsed.result as OrgDescribe;
        return orgInfo;
    } catch (error: any) {
        throw new Error(`Failed to get org from CLI: ${error.message}`);
    }
}

export function clearOrgCache(): void {
    console.log('[SF Assistant] Clearing org resolution promise');
    resolvingOrg = null;
}

/**
 * Force refresh org info (invalidate cache and fetch new data)
 */
export async function refreshOrgInfo(): Promise<OrgDescribe> {
    clearOrgCache();
    return getOrgInfo();
}

/* ------------------------------------------------------------------ */
/* Salesforce API wrapper                                              */
/* ------------------------------------------------------------------ */

export async function sfApi<T>(
    path: string,
    options: ApiOptions = {}
): Promise<T> {
    const org = await getOrgInfo();

    return callApi<T>(`${org.instanceUrl}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${org.accessToken}`,
            ...options.headers,
        },
    });
}

/* ------------------------------------------------------------------ */
/* Metadata APIs                                                       */
/* ------------------------------------------------------------------ */

export async function getObjectDescribe(
    objectName: string,
    isTooling = false
): Promise<ObjectDescribe> {
    const org = await getOrgInfo();
    const prefix = isTooling ? 'tooling/' : '';

    try {
        return sfApi<ObjectDescribe>(
            `/services/data/v${org.apiVersion}/${prefix}sobjects/${objectName}/describe`
        );
    } catch (error: any) {
        console.error(`[SF Assistant] Failed to describe object "${objectName}":`, error);
        throw new Error(
            `Failed to describe object "${objectName}". ` +
            `Ensure the object exists and you have access to it. ` +
            `Error: ${error.message}`
        );
    }
}

export async function getObjectList(
    isTooling = false
): Promise<any[]> {
    const org = await getOrgInfo();
    const prefix = isTooling ? 'tooling/' : '';

    try {
        const result = await sfApi<{ sobjects: any[] }>(
            `/services/data/v${org.apiVersion}/${prefix}sobjects`
        );
        return result.sobjects;
    } catch (error: any) {
        console.error(`[SF Assistant] Failed to fetch object list (${isTooling ? 'tooling' : 'standard'}):`, error);
        console.error(`[SF Assistant] Attempted URL: /services/data/v${org.apiVersion}/${prefix}sobjects`);
        throw new Error(
            `Failed to fetch ${isTooling ? 'tooling ' : ''}objects. ` +
            `Error: ${error.message}`
        );
    }
}

/* ------------------------------------------------------------------ */
/* SOQL                                                               */
/* ------------------------------------------------------------------ */

export async function runSOQLQuery(
    soql: string,
    isTooling = false
): Promise<{ records: any[] }> {
    const org = await getOrgInfo();
    const endpoint = isTooling ? 'tooling/query' : 'query';

    return sfApi<{ records: any[] }>(
        `/services/data/v${org.apiVersion}/${endpoint}`,
        {
            params: { q: soql },
        }
    );
}

export async function runSOQLQueryMore(
    nextRecordsUrl: string
): Promise<{ records: any[] }> {
    return sfApi<{ records: any[] }>(nextRecordsUrl);
}

export async function getRecordDescribe(
    Id: string,
    objectName: string,
    isTooling = false
): Promise<ObjectDescribe> {
    const org = await getOrgInfo();
    const prefix = isTooling ? 'tooling/' : '';

    let urlPath = `/services/data/v${org.apiVersion}/${prefix}sobjects/${objectName}/${Id}`;
    if (objectName === 'DeployRequest') {
        urlPath = `/services/data/v${org.apiVersion}/metadata/deployRequest/${Id}?includeDetails=true`;
    }
    try {
        return sfApi<ObjectDescribe>(urlPath);
    } catch (error: any) {
        console.error(`[SF Assistant] Failed to fetch record "${Id}" of type "${objectName}":`, error);
        throw new Error(
            `Failed to fetch record "${Id}" of type "${objectName}". ` +
            `Ensure the record exists and you have access to it. ` +
            `Error: ${error.message}`
        );
    }
}