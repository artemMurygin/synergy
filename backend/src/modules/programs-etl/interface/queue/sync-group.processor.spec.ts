import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { ProgramsSyncError } from '../../application/errors/programs-sync.error';
import type { SyncProgramsGroupUseCase } from '../../application/use-cases/sync-programs-group.use-case';
import type { SyncGroupJobData } from '../../infrastructure/queue/programs-etl-queue.dto';
import { SyncGroupProcessor } from './sync-group.processor';

function create(execute = vi.fn().mockResolvedValue({ runId: 'r1', created: 1, updated: 2 })): {
    processor: SyncGroupProcessor;
    execute: ReturnType<typeof vi.fn>;
} {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    return {
        processor: new SyncGroupProcessor(
            { execute } as unknown as SyncProgramsGroupUseCase,
            logger,
        ),
        execute,
    };
}

const job = {
    attemptsMade: 0,
    opts: {},
    data: {
        runId: 'r1',
        groupId: 'g1',
        changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
        previousRunId: 'r0',
    },
} as Job<SyncGroupJobData>;

describe('SyncGroupProcessor', () => {
    it('calls the sync use case with runId, groupId and changed sources only', async () => {
        const { processor, execute } = create();

        await expect(processor.process(job)).resolves.toEqual({
            runId: 'r1',
            created: 1,
            updated: 2,
        });
        expect(execute).toHaveBeenCalledWith({
            runId: 'r1',
            groupId: 'g1',
            trigger: 'retry',
            changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
        });
    });

    it('rethrows retryable ProgramsSyncError so BullMQ retries', async () => {
        const error = new ProgramsSyncError('AGENT_TIMEOUT', 'slow');
        const { processor } = create(vi.fn().mockRejectedValue(error));

        await expect(processor.process(job)).rejects.toBe(error);
    });

    it.each(['GROUP_NOT_FOUND', 'MUTATION_CONFLICT', 'SOURCE_NOT_IN_GROUP'] as const)(
        'maps permanent %s to UnrecoverableError',
        async (code) => {
            const { processor } = create(
                vi.fn().mockRejectedValue(new ProgramsSyncError(code, 'x')),
            );

            await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
        },
    );

    it('treats unknown errors as permanent (the run is already failed as non-retryable)', async () => {
        const { processor } = create(vi.fn().mockRejectedValue(new Error('boom')));

        await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    });
    it('tells the use case when BullMQ will still retry the job', async () => {
        const { processor, execute } = create();
        const withAttempts = (attemptsMade: number): Job<SyncGroupJobData> =>
            ({
                data: job.data,
                attemptsMade,
                opts: { attempts: 3 },
            }) as Job<SyncGroupJobData>;
        await processor.process(withAttempts(0));
        expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ finalAttempt: false }));

        await processor.process(withAttempts(2));
        expect(execute.mock.lastCall?.[0]).not.toHaveProperty('finalAttempt');
    });
});
