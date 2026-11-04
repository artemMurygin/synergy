import type { CatalogRecordRef, CatalogRecordType } from './catalog-mutation';
import type { SourceReference } from './source-fingerprint';

export interface CatalogSearchQuery {
    readonly recordType: CatalogRecordType;
    readonly criteria: Readonly<Record<string, string | number | boolean>>;
    readonly limit?: number;
}

export interface CatalogRecordSummary extends CatalogRecordRef {
    readonly naturalKey: Readonly<Record<string, string | number | null>>;
    readonly sources: readonly SourceReference[];
}

export interface CatalogRecordDetails extends CatalogRecordRef {
    readonly fields: Readonly<Record<string, unknown>>;
    readonly sources: readonly SourceReference[];
    readonly sectionText?: string;
}

export interface GetCatalogRecordQuery extends CatalogRecordRef {
    readonly section?: string;
}

export interface SourceRecordQuery {
    readonly sourceId: string;
    readonly rowNo?: number;
}
