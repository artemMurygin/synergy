import type { RunStatus, RunTrigger, ProgramsSyncRunRecord } from './programs-sync-run';
import type { ChangedSource } from './source-fingerprint';
import type { RunFailure } from '../errors/programs-sync.error';

export interface ScanProgramSourcesResult {
    readonly scannedSources: number;
    readonly changedSources: number;
    readonly enqueuedGroups: number;
}

export interface ScheduleProgramsGroupSyncCommand {
    readonly groupId: string;
    readonly changedSources: readonly ChangedSource[];
    readonly trigger: RunTrigger;
    readonly previousRunId?: string;
}

export interface SyncProgramsGroupCommand {
    readonly runId: string;
    readonly groupId: string;
    readonly changedSources: readonly ChangedSource[];
    /** Only used as a metrics label; defaults to `scheduled`. */
    readonly trigger?: RunTrigger;
    /**
     * `false` while the queue will still retry a transient failure of this run;
     * the run stays open until the last attempt. Defaults to `true`.
     */
    readonly finalAttempt?: boolean;
}

export interface ProgramsSyncResult {
    readonly runId: string;
    readonly created: number;
    readonly updated: number;
}

export interface SyncGroupJob {
    readonly runId: string;
    readonly groupId: string;
    readonly changedSources: readonly ChangedSource[];
    readonly previousRunId?: string;
}

export interface CursorPage<T> {
    readonly items: readonly T[];
    readonly nextCursor?: string;
}

export interface ListProgramsSyncRunsQueryInput {
    readonly groupId?: string;
    readonly status?: RunStatus;
    readonly limit: number;
    readonly cursor?: string;
}

export interface ProgramsSyncRunSummary {
    readonly id: string;
    readonly groupId: string;
    readonly status: RunStatus;
    readonly trigger: RunTrigger;
    readonly previousRunId?: string;
    readonly createdAt: Date;
    readonly finishedAt?: Date;
}

export type ProgramsSyncRunDetails = ProgramsSyncRunRecord & {
    readonly failure?: RunFailure;
};
