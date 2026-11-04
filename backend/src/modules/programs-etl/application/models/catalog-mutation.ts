import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { SourceReference } from './source-fingerprint';

export const CATALOG_RECORD_TYPES = [
    'organization',
    'faculty',
    'location',
    'program',
    'offer',
    'price',
    'entrance_requirement',
] as const;

export type CatalogRecordType = (typeof CATALOG_RECORD_TYPES)[number];

/** Record found by catalog read tools in the current run. */
export interface CatalogRecordRef {
    readonly recordType: CatalogRecordType;
    readonly recordId: string;
}

export interface CatalogMutation {
    readonly kind: 'create' | 'update';
    readonly recordType: CatalogRecordType;
    readonly recordId?: string;
    /** Plan-local name of a created record; later operations point to it with `{ ref: localKey }`. */
    readonly localKey?: string;
    readonly data: Readonly<Record<string, unknown>>;
    readonly sources: readonly SourceReference[];
}

export interface CatalogMutationPlan {
    readonly operations: readonly CatalogMutation[];
}

export interface ProgramContentSection {
    readonly programRef: CatalogRecordRef;
    readonly sectionType: string;
    readonly text: string;
    readonly source: SourceReference;
}

/** First version: create/update only; update needs recordId, create must not carry one. */
export function createCatalogMutationPlan(
    operations: readonly CatalogMutation[],
): CatalogMutationPlan {
    for (const operation of operations) {
        const kind: string = operation.kind;
        if (kind !== 'create' && kind !== 'update') {
            throw new ProgramsSyncError(
                'INVALID_WORKFLOW_DATA',
                `Unsupported mutation kind: ${kind}`,
            );
        }
        if (kind === 'update' && operation.recordId === undefined) {
            throw new ProgramsSyncError(
                'INVALID_WORKFLOW_DATA',
                'Update mutation requires recordId',
            );
        }
        if (kind === 'create' && operation.recordId !== undefined) {
            throw new ProgramsSyncError(
                'INVALID_WORKFLOW_DATA',
                'Create mutation must not carry recordId',
            );
        }
    }
    return { operations: [...operations] };
}
