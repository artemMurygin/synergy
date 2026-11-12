import { describe, expect, it, vi } from 'vitest';
import { PurgeExpiredFilesUseCase } from '../../application/purge-expired-files.use-case';
import {
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    RecordingEventPublisher,
    silentLogger,
    testRetentionPolicy,
} from '../../application/test-doubles';
import { FilesPurgeProcessor } from './files-purge.processor';

function createPurge(): PurgeExpiredFilesUseCase {
    const transactions = new InMemoryTransactionRunner();
    return new PurgeExpiredFilesUseCase(
        new InMemoryStoredFileRepository(),
        new InMemoryObjectStorage(),
        testRetentionPolicy(),
        transactions,
        new RecordingEventPublisher(transactions),
        silentLogger(),
    );
}

describe('FilesPurgeProcessor', () => {
    it('runs the purge with the current time, logs and returns its counts', async () => {
        const purge = createPurge();
        const execute = vi.spyOn(purge, 'execute').mockResolvedValue({ deleted: 3, failed: 1 });
        const logger = silentLogger();
        const info = vi.spyOn(logger, 'info');
        const before = Date.now();

        const result = await new FilesPurgeProcessor(purge, logger).process();

        expect(result).toEqual({ deleted: 3, failed: 1 });
        expect(execute).toHaveBeenCalledTimes(1);
        const now = execute.mock.calls[0][0];
        expect(now.getTime()).toBeGreaterThanOrEqual(before);
        expect(now.getTime()).toBeLessThanOrEqual(Date.now());
        expect(info).toHaveBeenCalledWith(
            { deletedCount: 3, failedCount: 1 },
            'Expired files purged',
        );
    });

    it('rethrows a purge error so the job is marked failed', async () => {
        const purge = createPurge();
        vi.spyOn(purge, 'execute').mockRejectedValue(new Error('db is down'));

        await expect(new FilesPurgeProcessor(purge, silentLogger()).process()).rejects.toThrow(
            'db is down',
        );
    });

    it('logs a failed job with the error under err', () => {
        const logger = silentLogger();
        const error = vi.spyOn(logger, 'error');
        const failure = new Error('db is down');

        new FilesPurgeProcessor(createPurge(), logger).onFailed(undefined, failure);

        expect(error).toHaveBeenCalledWith({ err: failure }, 'Files purge failed');
    });
});
