// src/dataLoadService.ts
import { getOrgInfo, sfApi } from './salesforceService';
import { DataLoadResult } from '../types/dataLoad';
import type { HttpMethod } from '../utils';

export class DataLoadService {

    static async process(
        action: 'insert' | 'update' | 'upsert' | 'delete' | 'undelete',
        objectName: string,
        records: any[],
        options: {
            externalIdField?: string;
        } = {}
    ): Promise<DataLoadResult[]> {

        const orgInfo = await getOrgInfo();
        const apiVersion = orgInfo.apiVersion;

        switch (action) {
            case 'insert':
                return this.insert(apiVersion, objectName, records);

            case 'update':
                return this.update(apiVersion, objectName, records);

            case 'upsert':
                if (!options.externalIdField) {
                    throw new Error('externalIdField is required for upsert');
                }
                return this.upsert(
                    apiVersion,
                    objectName,
                    records,
                    options.externalIdField
                );

            case 'delete':
                return this.delete(apiVersion, objectName, records);

            case 'undelete':
                return this.undelete(apiVersion, objectName, records);

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    }

    // ---------- INSERT ----------
    private static async insert(
        version: string,
        objectName: string,
        records: any[]
    ): Promise<DataLoadResult[]> {

        const payload = {
            allOrNone: false,
            records: records.map((r, idx) => ({
                attributes: { type: objectName, referenceId: `ref_${idx}` },
                ...r
            }))
        };

        return this.callComposite(version, 'POST', payload, records.length);
    }

    // ---------- UPDATE ----------
    private static async update(
        version: string,
        objectName: string,
        records: any[]
    ): Promise<DataLoadResult[]> {

        const payload = {
            allOrNone: false,
            records: records.map((r, idx) => {
                const { Id, ...data } = r;
                return {
                    attributes: { type: objectName, referenceId: `ref_${idx}` },
                    Id,
                    ...data
                };
            })
        };

        return this.callComposite(version, 'PATCH', payload, records.length);
    }

    // ---------- UPSERT ----------
    private static async upsert(
        version: string,
        objectName: string,
        records: any[],
        externalIdField: string
    ): Promise<DataLoadResult[]> {

        const payload = {
            allOrNone: false,
            records: records.map((r, idx) => {
                const { Id, ...data } = r;
                return {
                    attributes: {
                        type: objectName,
                        referenceId: `ref_${idx}`
                    },
                    [externalIdField]: r[externalIdField],
                    ...data
                };
            })
        };

        const endpoint = `/services/data/v${version}/composite/sobjects/${objectName}/${externalIdField}`;
        return this.callComposite(version, 'PATCH', payload, records.length, endpoint);
    }

    // ---------- DELETE ----------
    private static async delete(
        version: string,
        objectName: string,
        records: any[]
    ): Promise<DataLoadResult[]> {

        const ids = records.map(r => r.Id).filter(Boolean);
        if (!ids.length) {
            return records.map((_, idx) => ({
                success: false,
                index: idx,
                errors: ['Missing Id field']
            }));
        }

        const endpoint = `/services/data/v${version}/composite/sobjects?ids=${ids.join(',')}&allOrNone=false`;

        const response = await sfApi<any[]>(endpoint, { method: 'DELETE' });

        return response.map((r: any, idx: number) => ({
            success: r.success || false,
            id: r.id,
            index: idx,
            errors: r.errors?.map((e: any) => typeof e === 'string' ? e : e.message),
            raw: r
        }));
    }

    // ---------- UNDELETE ----------
    private static async undelete(
        version: string,
        objectName: string,
        records: any[]
    ): Promise<DataLoadResult[]> {

        const payload = {
            allOrNone: false,
            records: records.map((r, idx) => ({
                attributes: { type: objectName, referenceId: `ref_${idx}` },
                Id: r.Id
            }))
        };

        const endpoint = `/services/data/v${version}/composite/sobjects/undelete`;
        return this.callComposite(version, 'PATCH', payload, records.length, endpoint);
    }

    // ---------- SHARED ----------
    private static async callComposite(
        version: string,
        method: HttpMethod,
        payload: any,
        recordCount: number,
        customEndpoint?: string
    ): Promise<DataLoadResult[]> {

        const endpoint =
            customEndpoint ||
            `/services/data/v${version}/composite/sobjects`;

        const response = await sfApi<any>(endpoint, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: payload
        });

        const results = response.map((r: any, idx: number) => ({
            success: r.success || false,
            id: r.id,
            index: idx,
            errors: r.errors?.map((e: any) => typeof e === 'string' ? e : e.message),
            raw: r
        }));

        return results;
    }
}