import type { JobsOptions } from 'bullmq';

export const PROGRAMS_ETL_QUEUE_NAMES = {
    SCAN: 'programs-etl-scan',
    SYNC: 'programs-etl-sync',
} as const;

export const PROGRAMS_ETL_JOB_NAMES = {
    SCAN_SOURCES: 'scan-sources',
    SYNC_GROUP: 'sync-group',
} as const;

/** Bounded attempts with exponential backoff; all attempts belong to one run. */
export const PROGRAMS_ETL_SYNC_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
} as const satisfies Pick<JobsOptions, 'attempts' | 'backoff'>;

export function programsSyncJobId(runId: string): string {
    return `programs-etl:sync:${runId}`;
}
