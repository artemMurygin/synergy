import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { UnrecoverableError } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostSystemMessageUseCase } from '../../application/post-system-message.use-case';
import type { SystemMessageCommand } from '../../contracts/system-message.command';
import { RunInProgressError } from '../../domain/run-in-progress.error';
import { SystemMessageProcessor, type SystemMessageJob } from './system-message.processor';
import { systemMessageJobOptions } from './system-message-queue.module';

const RETRY_MS = 5_000;
const DEADLINE_MS = 600_000;
const NOW = 1_800_000_000_000;

const config = {
    get: (key: string) =>
        ({ CHAT_SYSTEM_MESSAGE_RETRY_MS: RETRY_MS, CHAT_SYSTEM_MESSAGE_DEADLINE_MS: DEADLINE_MS })[
            key
        ],
} as unknown as ConfigService<Env, true>;

const command: SystemMessageCommand = {
    sessionId: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231',
    ownerId: 'owner-1',
    text: 'Готово',
    attachments: [],
    dedupKey: 'event-1',
    topic: 'meeting-transcript.ready',
    subject: { fileId: 'rec-1', fileName: 'встреча.m4a' },
};

function job(ageMs: number, data: unknown = command): SystemMessageJob {
    return { id: 'event-1', data, timestamp: NOW - ageMs };
}

function setup(execute: PostSystemMessageUseCase['execute']): {
    processor: SystemMessageProcessor;
    logger: { warn: ReturnType<typeof vi.fn> };
} {
    const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const processor = new SystemMessageProcessor(
        { execute } as unknown as PostSystemMessageUseCase,
        config,
        logger as unknown as PinoLogger,
    );
    return { processor, logger };
}

describe('SystemMessageProcessor', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('posts the message of the job', async () => {
        const execute = vi.fn().mockResolvedValue('posted');
        const { processor } = setup(execute);
        await processor.process(job(0));
        expect(execute).toHaveBeenCalledWith(command);
    });

    it.each(['duplicate', 'skipped'])('finishes the job on %s', async (outcome) => {
        const { processor } = setup(vi.fn().mockResolvedValue(outcome));
        await expect(processor.process(job(0))).resolves.toBeUndefined();
    });

    it('rethrows RunInProgressError before the deadline so the job is retried with a delay', async () => {
        const failure = new RunInProgressError(command.sessionId);
        const { processor } = setup(vi.fn().mockRejectedValue(failure));
        await expect(processor.process(job(DEADLINE_MS - 1))).rejects.toBe(failure);
    });

    it('gives up with an unrecoverable error once the deadline is over', async () => {
        const { processor, logger } = setup(
            vi.fn().mockRejectedValue(new RunInProgressError(command.sessionId)),
        );
        await expect(processor.process(job(DEADLINE_MS))).rejects.toBeInstanceOf(
            UnrecoverableError,
        );
        expect(logger.warn).toHaveBeenCalled();
    });

    it('rejects an invalid payload as unrecoverable without posting', async () => {
        const execute = vi.fn();
        const { processor } = setup(execute);
        await expect(processor.process(job(0, { sessionId: 1 }))).rejects.toBeInstanceOf(
            UnrecoverableError,
        );
        expect(execute).not.toHaveBeenCalled();
    });
});

describe('systemMessageJobOptions', () => {
    it('retries with a fixed delay often enough to reach the deadline', () => {
        const options = systemMessageJobOptions(config);
        expect(options.backoff).toEqual({ type: 'fixed', delay: RETRY_MS });
        expect((options.attempts ?? 0) * RETRY_MS).toBeGreaterThanOrEqual(DEADLINE_MS);
    });
});
