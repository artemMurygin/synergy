import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { ProgramsSyncError } from '../../application/errors/programs-sync.error';
import type { ScanProgramSourcesUseCase } from '../../application/use-cases/scan-program-sources.use-case';
import type { ScanSourcesJobData } from '../../infrastructure/queue/programs-etl-queue.dto';
import { ScanSourcesProcessor } from './scan-sources.processor';

const RESULT = { scannedSources: 3, changedSources: 1, enqueuedGroups: 1 };

function create(execute = vi.fn().mockResolvedValue(RESULT)): {
    processor: ScanSourcesProcessor;
    execute: ReturnType<typeof vi.fn>;
} {
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const processor = new ScanSourcesProcessor(
        { execute } as unknown as ScanProgramSourcesUseCase,
        logger,
    );
    return { processor, execute };
}

const job = { data: { scheduledAt: '2026-01-01T00:00:00.000Z' } } as Job<ScanSourcesJobData>;

describe('ScanSourcesProcessor', () => {
    it('runs the scan use case with the current time and returns its result', async () => {
        const { processor, execute } = create();

        await expect(processor.process(job)).resolves.toEqual(RESULT);
        expect(execute).toHaveBeenCalledWith(expect.any(Date));
    });

    it('skips a tick while the previous scan is still running', async () => {
        let release: (value: typeof RESULT) => void = () => undefined;
        const execute = vi.fn().mockReturnValue(
            new Promise<typeof RESULT>((resolve) => {
                release = resolve;
            }),
        );
        const { processor } = create(execute);

        const first = processor.process(job);
        const second = await processor.process(job);
        release(RESULT);
        await first;

        expect(second).toEqual({ skipped: true });
        expect(execute).toHaveBeenCalledTimes(1);
        await processor.process(job);
        expect(execute).toHaveBeenCalledTimes(2);
    });

    it('releases the guard after a failure', async () => {
        const { processor, execute } = create(vi.fn().mockRejectedValueOnce(new Error('db down')));
        await expect(processor.process(job)).rejects.toThrow('db down');
        execute.mockResolvedValue(RESULT);
        await expect(processor.process(job)).resolves.toEqual(RESULT);
    });

    it('rethrows retryable errors as is so BullMQ retries', async () => {
        const error = new ProgramsSyncError('SOURCE_UNAVAILABLE', 'sheets down');
        const { processor } = create(vi.fn().mockRejectedValue(error));

        await expect(processor.process(job)).rejects.toBe(error);
    });

    it('maps permanent errors to UnrecoverableError', async () => {
        const { processor } = create(
            vi.fn().mockRejectedValue(new ProgramsSyncError('INVALID_WORKFLOW_DATA', 'bad')),
        );

        await expect(processor.process(job)).rejects.toBeInstanceOf(UnrecoverableError);
    });
});
