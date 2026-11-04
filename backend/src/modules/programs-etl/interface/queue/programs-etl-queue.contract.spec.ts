import { UnrecoverableError, type JobsOptions, type Queue } from 'bullmq';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    ProgramsSyncError,
    PROGRAMS_SYNC_ERROR_CODES,
    type ProgramsSyncErrorCode,
} from '../../application/errors/programs-sync.error';
import { BullProgramsSyncQueue } from '../../infrastructure/queue/bull-programs-sync-queue';
import {
    PROGRAMS_ETL_JOB_NAMES,
    PROGRAMS_ETL_QUEUE_NAMES,
    PROGRAMS_ETL_SYNC_JOB_OPTIONS,
    programsSyncJobId,
} from '../../infrastructure/queue/programs-etl-queue.constants';
import type {
    ScanSourcesJobData,
    SyncGroupJobData,
} from '../../infrastructure/queue/programs-etl-queue.dto';
import { mapJobError } from './programs-job-error';

/** architecture.md API Contract / Queue Contracts / Errors. */
describe('programs-etl queue contract', () => {
    it('uses the contract queue and job names', () => {
        expect(PROGRAMS_ETL_QUEUE_NAMES.SCAN).toBe('programs-etl-scan');
        expect(PROGRAMS_ETL_QUEUE_NAMES.SYNC).toBe('programs-etl-sync');
        expect(PROGRAMS_ETL_JOB_NAMES.SCAN_SOURCES).toBe('scan-sources');
        expect(PROGRAMS_ETL_JOB_NAMES.SYNC_GROUP).toBe('sync-group');
    });

    it('scan-sources payload is exactly { scheduledAt: string }', () => {
        const data: ScanSourcesJobData = { scheduledAt: '2026-01-01T00:00:00.000Z' };
        expect(Object.keys(data)).toEqual(['scheduledAt']);
    });

    it('sync-group payload carries required runId/groupId/changedSources and optional previousRunId', async () => {
        const add = vi
            .fn<(n: string, d: SyncGroupJobData, o: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new BullProgramsSyncQueue({ add } as unknown as Queue);
        await queue.enqueueGroup({
            runId: 'r2',
            groupId: 'g1',
            changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
            previousRunId: 'r1',
        });
        const [, data, opts] = add.mock.calls[0];
        expect(Object.keys(data).sort()).toEqual(
            ['changedSources', 'groupId', 'previousRunId', 'runId'].sort(),
        );
        expect(Object.keys(data.changedSources[0]).sort()).toEqual(['observedHash', 'sourceId']);
        expect(opts.jobId).toBe('programs-etl:sync:r2');
        expect(opts.attempts).toBeGreaterThan(1);
        expect(opts.backoff).toMatchObject({ type: 'exponential' });
        expect(PROGRAMS_ETL_SYNC_JOB_OPTIONS.attempts).toBe(opts.attempts);
    });

    it('jobId is derived only from runId, so re-enqueue of one run is idempotent', () => {
        expect(programsSyncJobId('abc')).toBe('programs-etl:sync:abc');
        expect(programsSyncJobId('abc')).toBe(programsSyncJobId('abc'));
        expect(programsSyncJobId('abc')).not.toBe(programsSyncJobId('abd'));
    });

    describe('error retryability', () => {
        const expected: Record<ProgramsSyncErrorCode, boolean> = {
            GROUP_NOT_FOUND: false,
            GROUP_NOT_RUNNABLE: false,
            GROUP_NOT_AVAILABLE: false,
            INVALID_QUERY: false,
            SOURCE_NOT_IN_GROUP: false,
            INVALID_RANGE: false,
            SOURCE_UNAVAILABLE: true,
            RATE_LIMITED: true,
            TIMEOUT: true,
            CATALOG_UNAVAILABLE: true,
            RECORD_NOT_FOUND: false,
            AGENT_TIMEOUT: true,
            AGENT_PROVIDER_ERROR: true,
            MUTATION_CONFLICT: false,
            INVALID_WORKFLOW_DATA: false,
        };

        it('covers every declared error code', () => {
            expect(Object.keys(expected).sort()).toEqual([...PROGRAMS_SYNC_ERROR_CODES].sort());
        });

        it.each(Object.entries(expected))(
            '%s retryable=%s maps to BullMQ behaviour',
            (code, retryable) => {
                const error = new ProgramsSyncError(code as ProgramsSyncErrorCode, 'x');
                expect(error.retryable).toBe(retryable);
                const mapped = mapJobError(error, false);
                if (retryable) expect(mapped).toBe(error);
                else expect(mapped).toBeInstanceOf(UnrecoverableError);
            },
        );
    });

    it('exposes no public HTTP endpoints', () => {
        const root = join(__dirname, '..', '..');
        const files: string[] = [];
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir)) {
                const path = join(dir, entry);
                if (statSync(path).isDirectory()) walk(path);
                else if (path.endsWith('.ts') && !path.endsWith('.spec.ts')) files.push(path);
            }
        };
        walk(root);
        const offenders = files.filter((f) =>
            /@(Controller|Get|Post|Put|Patch|Delete)\(/.test(readFileSync(f, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});
