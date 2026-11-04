import type { RunFailure } from '../errors/programs-sync.error';
import type { ChangedSource } from './source-fingerprint';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RunTrigger = 'scheduled' | 'retry';

export interface ProgramsSyncRunRecord {
    readonly id: string;
    readonly groupId: string;
    readonly previousRunId?: string;
    readonly trigger: RunTrigger;
    readonly status: RunStatus;
    readonly changedSources: readonly ChangedSource[];
    readonly createdAt: Date;
    readonly startedAt?: Date;
    readonly finishedAt?: Date;
    readonly failure?: RunFailure;
}

export interface NewProgramsSyncRun {
    readonly id: string;
    readonly groupId: string;
    readonly trigger: RunTrigger;
    readonly previousRunId?: string;
    readonly changedSources: readonly ChangedSource[];
    readonly now: Date;
}

export class InvalidRunTransitionError extends Error {
    constructor(
        readonly runId: string,
        readonly from: RunStatus,
        readonly to: RunStatus,
    ) {
        super(`Invalid sync run transition ${from} -> ${to} for run ${runId}`);
        this.name = 'InvalidRunTransitionError';
    }
}

export function createQueuedRun(input: NewProgramsSyncRun): ProgramsSyncRunRecord {
    return {
        id: input.id,
        groupId: input.groupId,
        ...(input.previousRunId === undefined ? {} : { previousRunId: input.previousRunId }),
        trigger: input.trigger,
        status: 'queued',
        changedSources: [...input.changedSources],
        createdAt: input.now,
    };
}

/** queued -> running; idempotent for an already running run. */
export function startRun(run: ProgramsSyncRunRecord, now: Date): ProgramsSyncRunRecord {
    if (run.status === 'running') return run;
    if (run.status !== 'queued') throw new InvalidRunTransitionError(run.id, run.status, 'running');
    return { ...run, status: 'running', startedAt: now };
}

export function succeedRun(run: ProgramsSyncRunRecord, now: Date): ProgramsSyncRunRecord {
    if (run.status !== 'running')
        throw new InvalidRunTransitionError(run.id, run.status, 'succeeded');
    return { ...run, status: 'succeeded', finishedAt: now };
}

export function failRun(
    run: ProgramsSyncRunRecord,
    input: { failure: RunFailure; now: Date },
): ProgramsSyncRunRecord {
    if (run.status !== 'queued' && run.status !== 'running') {
        throw new InvalidRunTransitionError(run.id, run.status, 'failed');
    }
    return { ...run, status: 'failed', finishedAt: input.now, failure: input.failure };
}
