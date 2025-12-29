// src/types/salesforceDescribe.ts

export interface OrgDescribe {
    id: string;
    apiVersion: string;
    accessToken: string;
    instanceUrl: string;
    username: string;
    clientId: string;
    connectedStatus: 'Connected' | 'Disconnected';
    alias: string;
}

export interface ObjectDescribe {
    name: string;
    label: string;
    keyPrefix?: string;
    custom: boolean;
    createable: boolean;
    updateable: boolean;
    deleteable: boolean;
    undeletable?: boolean;
    fields: FieldDescribe[];
    childRelationships?: ChildRelationshipDescribe[];
}

export interface FieldDescribe {
    name: string;
    label: string;
    type: string;

    length?: number;
    precision?: number;
    scale?: number;

    custom: boolean;
    createable: boolean;
    updateable: boolean;
    nillable: boolean;

    externalId?: boolean;
    unique?: boolean;
    idLookup?: boolean;

    calculated?: boolean;
    calculatedFormula?: string;

    referenceTo?: string[];
    relationshipName?: string;

    picklistValues?: PicklistValueDescribe[];
}

export interface PicklistValueDescribe {
    label: string;
    value: string;
    active: boolean;
    defaultValue: boolean;
}

export interface ChildRelationshipDescribe {
    relationshipName?: string;
    childSObject: string;
    field: string;
    label?: string;
}
