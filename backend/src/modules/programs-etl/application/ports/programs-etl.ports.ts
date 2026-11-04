import type { CatalogMutationPlan } from '../models/catalog-mutation';
import type {
    CatalogRecordDetails,
    CatalogRecordSummary,
    CatalogSearchQuery,
    GetCatalogRecordQuery,
    SourceRecordQuery,
} from '../models/catalog-query';
import type { GroupId, GroupSource, ProgramsGroup } from '../models/programs-group';
import type { NewProgramsSyncRun, ProgramsSyncRunRecord } from '../models/programs-sync-run';
import type { BoundedA1Range, SheetRangeResult } from '../models/sheets';
import type { ChangedSource, SourceFingerprint } from '../models/source-fingerprint';
import type {
    CursorPage,
    ListProgramsSyncRunsQueryInput,
    ProgramsSyncRunSummary,
    SyncGroupJob,
} from '../models/sync-commands';
import type { RunFailure } from '../errors/programs-sync.error';

export interface GroupRegistryPort {
    /** Only groups with status `ready`. */
    listScheduledGroups(): Promise<ProgramsGroup[]>;
    getGroup(groupId: GroupId): Promise<ProgramsGroup | null>;
}

export interface SheetsReaderPort {
    readFingerprints(sources: GroupSource[]): Promise<Map<string, SourceFingerprint>>;
    readRange(input: { source: GroupSource; range: BoundedA1Range }): Promise<SheetRangeResult>;
}

export interface ProgramsAgentPort {
    buildMutationPlan(input: {
        runId: string;
        group: ProgramsGroup;
        changedSources: ChangedSource[];
    }): Promise<CatalogMutationPlan>;
}

export interface CatalogQueryPort {
    searchRecords(query: CatalogSearchQuery): Promise<CatalogRecordSummary[]>;
    getRecord(query: GetCatalogRecordQuery): Promise<CatalogRecordDetails | null>;
    listSourceRecords(query: SourceRecordQuery): Promise<CatalogRecordSummary[]>;
}

export interface CatalogWriterPort {
    applyPlan(input: {
        runId: string;
        groupId: GroupId;
        plan: CatalogMutationPlan;
    }): Promise<{ created: number; updated: number }>;
}

export interface SourceStateRepositoryPort {
    /** `null` means the source has not been processed yet. */
    findSuccessfulFingerprints(sourceIds: string[]): Promise<Map<string, SourceFingerprint | null>>;
    markSuccessfullyProcessed(input: {
        runId: string;
        fingerprints: ChangedSource[];
    }): Promise<void>;
}

export interface SyncRunStorePort {
    createQueued(run: NewProgramsSyncRun): Promise<ProgramsSyncRunRecord>;
    markRunning(runId: string): Promise<void>;
    markSucceeded(runId: string): Promise<void>;
    markFailed(input: { runId: string; failure: RunFailure }): Promise<void>;
    findById(runId: string): Promise<ProgramsSyncRunRecord | null>;
    list(input: ListProgramsSyncRunsQueryInput): Promise<CursorPage<ProgramsSyncRunSummary>>;
}

export interface ProgramsSyncQueuePort {
    enqueueGroup(job: SyncGroupJob): Promise<void>;
}

export interface ProgramsSyncMetricsPort {
    recordScan(input: { outcome: 'success' | 'failure'; changedSources: number }): void;
    recordRun(input: {
        status: 'succeeded' | 'failed';
        trigger: 'scheduled' | 'retry';
        durationSeconds: number;
    }): void;
    recordToolCall(input: {
        tool: string;
        outcome: 'success' | 'failure';
        durationSeconds?: number;
    }): void;
}

/** Metadata-only phase log entry: never cell values, prompts or catalog record bodies. */
export interface ProgramsSyncLogEntry {
    readonly phase: 'scan' | 'agent' | 'write' | 'fingerprint' | 'run';
    readonly groupId?: string;
    readonly runId?: string;
    readonly durationMs: number;
    readonly outcome: 'success' | 'failure';
    readonly errorCode?: string;
    readonly changedSources?: number;
}

export interface ProgramsSyncLoggerPort {
    log(entry: ProgramsSyncLogEntry): void;
}

export interface ProgramsSyncObservability {
    readonly metrics?: ProgramsSyncMetricsPort;
    readonly logger?: ProgramsSyncLoggerPort;
    readonly now?: () => number;
}
