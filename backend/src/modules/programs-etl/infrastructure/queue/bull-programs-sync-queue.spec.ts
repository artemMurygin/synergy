import type { JobsOptions, Queue } from 'bullmq';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { BullProgramsSyncQueue } from './bull-programs-sync-queue';
import {
    PROGRAMS_ETL_JOB_NAMES,
    PROGRAMS_ETL_SYNC_JOB_OPTIONS,
    programsSyncJobId,
} from './programs-etl-queue.constants';
import type { SyncGroupJobData } from './programs-etl-queue.dto';

function make(): {
    add: Mock<(name: string, data: SyncGroupJobData, opts: JobsOptions) => Promise<void>>;
    queue: BullProgramsSyncQueue;
} {
    const add = vi
        .fn<(name: string, data: SyncGroupJobData, opts: JobsOptions) => Promise<void>>()
        .mockResolvedValue();
    return { add, queue: new BullProgramsSyncQueue({ add } as unknown as Queue) };
}

describe('BullProgramsSyncQueue', () => {
    it('enqueues sync-group with jobId programs-etl:sync:<runId> and retry options', async () => {
        const { add, queue } = make();
        await queue.enqueueGroup({
            runId: 'r1',
            groupId: 'g1',
            changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
        });
        const [name, data, opts] = add.mock.calls[0];
        expect(name).toBe(PROGRAMS_ETL_JOB_NAMES.SYNC_GROUP);
        expect(name).toBe('sync-group');
        expect(data).toEqual({
            runId: 'r1',
            groupId: 'g1',
            changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
        });
        expect(opts.jobId).toBe('programs-etl:sync:r1');
        expect(opts.jobId).toBe(programsSyncJobId('r1'));
        expect(opts.attempts).toBe(PROGRAMS_ETL_SYNC_JOB_OPTIONS.attempts);
        expect(opts.backoff).toEqual({
            type: 'exponential',
            delay: PROGRAMS_ETL_SYNC_JOB_OPTIONS.backoff.delay,
        });
    });

    it('includes previousRunId only when given', async () => {
        const { add, queue } = make();
        await queue.enqueueGroup({
            runId: 'r2',
            groupId: 'g1',
            changedSources: [],
            previousRunId: 'r1',
        });
        expect(add.mock.calls[0][1].previousRunId).toBe('r1');
    });

    it('propagates enqueue errors', async () => {
        const add = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('redis down'));
        const queue = new BullProgramsSyncQueue({ add } as unknown as Queue);
        await expect(
            queue.enqueueGroup({ runId: 'r', groupId: 'g', changedSources: [] }),
        ).rejects.toThrow('redis down');
    });
});
