import { describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { SyncProjectCallsUseCase } from '../../application/use-cases/sync-project-calls.use-case';
import { VocalAiSyncProcessor } from './vocal-ai-sync.processor';

interface Fixture {
    execute: MockInstance<SyncProjectCallsUseCase['execute']>;
    error: MockInstance<PinoLogger['error']>;
    warn: MockInstance<PinoLogger['warn']>;
    info: MockInstance<PinoLogger['info']>;
    processor: VocalAiSyncProcessor;
}

type JobStub = Pick<Job, 'id' | 'attemptsMade' | 'opts' | 'data'>;

function createFixture(): Fixture {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const syncProjectCalls = new SyncProjectCallsUseCase(
        { login: vi.fn(), refreshToken: vi.fn(), listCalls: vi.fn(), getCall: vi.fn() },
        {
            upsertMany: vi.fn(),
            findByFilter: vi.fn(),
            countByFilter: vi.fn(),
            aggregateStats: vi.fn(),
        },
        { get: vi.fn(), set: vi.fn() },
        { execute: vi.fn() },
        logger,
    );
    const execute = vi.spyOn(syncProjectCalls, 'execute');
    const error = vi.spyOn(logger, 'error');
    const warn = vi.spyOn(logger, 'warn');
    const info = vi.spyOn(logger, 'info');
    const processor = new VocalAiSyncProcessor(syncProjectCalls, logger);
    return { execute, error, warn, info, processor };
}

function createJob(projectId: string, attemptsMade: number, attempts: number | undefined): JobStub {
    return { id: '1', attemptsMade, opts: { attempts }, data: { projectId } };
}

describe('VocalAiSyncProcessor', () => {
    it('runs the sync use case for the projectId of its own job and returns its result', async () => {
        const { execute, processor } = createFixture();
        execute.mockResolvedValue({ syncedCallsCount: 3 });

        const result = await processor.process(createJob('project-1', 0, 3));

        expect(result).toEqual({ syncedCallsCount: 3 });
        expect(execute).toHaveBeenCalledWith('project-1', expect.any(Date));
    });

    it('logs the result on success', async () => {
        const { execute, info, processor } = createFixture();
        execute.mockResolvedValue({ syncedCallsCount: 3 });

        await processor.process(createJob('project-1', 0, 3));

        expect(info).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'project-1', syncedCallsCount: 3 }),
            expect.any(String),
        );
    });

    it('rethrows use case errors so that BullMQ retries the job', async () => {
        const { execute, processor } = createFixture();
        execute.mockRejectedValue(new Error('vocal-ai down'));

        await expect(processor.process(createJob('project-1', 0, 3))).rejects.toThrow(
            'vocal-ai down',
        );
    });

    it('logs an error including the projectId when attempts are exhausted', () => {
        const { error, processor } = createFixture();
        const err = new Error('vocal-ai down');

        processor.onFailed(createJob('project-1', 3, 3), err);

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ err, jobId: '1', attemptsMade: 3, projectId: 'project-1' }),
            expect.any(String),
        );
    });

    it('logs a warning and not an error while attempts remain', () => {
        const { error, warn, processor } = createFixture();

        processor.onFailed(createJob('project-1', 1, 3), new Error('vocal-ai down'));

        expect(error).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('does not throw from the failed handler, so a worker-level error in one job does not stop other jobs', () => {
        const { processor } = createFixture();

        expect(() => {
            processor.onFailed(createJob('project-1', 3, 3), new Error('boom'));
        }).not.toThrow();
    });

    it('logs the failure of one project without the other project data', () => {
        const { error, processor } = createFixture();
        const err = new Error('vocal-ai down');

        processor.onFailed(createJob('project-2', 3, 3), err);

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'project-2' }),
            expect.any(String),
        );
    });
});
