import { describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { SyncDealsUseCase } from '../../application/use-cases/sync-deals.use-case';
import { DealSyncProcessor } from './deal-sync.processor';

interface Fixture {
    execute: MockInstance<SyncDealsUseCase['execute']>;
    error: MockInstance<PinoLogger['error']>;
    warn: MockInstance<PinoLogger['warn']>;
    processor: DealSyncProcessor;
}

type JobStub = Pick<Job, 'id' | 'attemptsMade' | 'opts'>;

function createFixture(): Fixture {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const syncDeals = new SyncDealsUseCase(
        { listUpdatedDealIds: vi.fn(), getDeal: vi.fn() },
        { enqueue: vi.fn() },
        { get: vi.fn(), set: vi.fn() },
        0,
        logger,
        { recordAudit: vi.fn(), recordNotification: vi.fn(), recordDealsEnqueued: vi.fn() },
    );
    const execute = vi.spyOn(syncDeals, 'execute');
    const error = vi.spyOn(logger, 'error');
    const warn = vi.spyOn(logger, 'warn');
    const processor = new DealSyncProcessor(syncDeals, logger);
    return { execute, error, warn, processor };
}

function createJob(attemptsMade: number, attempts: number | undefined): JobStub {
    return { id: '1', attemptsMade, opts: { attempts } };
}

describe('DealSyncProcessor', () => {
    it('runs the sync use case and returns its result', async () => {
        const { execute, processor } = createFixture();
        execute.mockResolvedValue({ enqueued: 2 });

        const result = await processor.process();

        expect(result).toEqual({ enqueued: 2 });
        expect(execute).toHaveBeenCalledWith(expect.any(Date));
    });

    it('rethrows use case errors so that BullMQ retries the job', async () => {
        const { execute, processor } = createFixture();
        execute.mockRejectedValue(new Error('crm down'));

        await expect(processor.process()).rejects.toThrow('crm down');
    });

    it('logs an error when attempts are exhausted', () => {
        const { error, processor } = createFixture();
        const err = new Error('crm down');

        processor.onFailed(createJob(3, 3), err);

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ err, jobId: '1', attemptsMade: 3 }),
            'Deal sync failed after all attempts',
        );
    });

    it('logs a warning and not an error while attempts remain', () => {
        const { error, warn, processor } = createFixture();

        processor.onFailed(createJob(1, 3), new Error('crm down'));

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });
});
