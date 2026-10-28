import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { RequestContext } from '../../../../shared/context/request-context';
import type { DeliverNotificationUseCase } from '../../application/use-cases/deliver-notification.use-case';
import { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { PermanentNotifyError, TransientNotifyError } from '../../domain/errors/notify.errors';
import { NotificationProcessor } from './notification.processor';
import type { NotificationJobData } from '../../infrastructure/queue/queue-job-data';

function createJob(data: NotificationJobData): Job<NotificationJobData> {
    return { id: 'job-1', data } as unknown as Job<NotificationJobData>;
}

function setup(): {
    processor: NotificationProcessor;
    deliver: { execute: Mock };
    logger: { setContext: Mock; info: Mock; warn: Mock; error: Mock };
} {
    const deliver = { execute: vi.fn().mockResolvedValue('sent') };
    const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const processor = new NotificationProcessor(
        deliver as unknown as DeliverNotificationUseCase,
        logger as unknown as PinoLogger,
    );
    return { processor, deliver, logger };
}

describe('NotificationProcessor', () => {
    it('delivers the notification from the job data', async () => {
        const { processor, deliver } = setup();

        await processor.process(createJob({ username: 'ivan', message: 'Fix' }));

        expect(deliver.execute).toHaveBeenCalledWith(
            new NotificationJob({ username: 'ivan', message: 'Fix' }),
        );
    });

    it('restores the request context from the job data', async () => {
        const { processor, deliver } = setup();
        const requestIds = { requestId: 'req-1', correlationId: 'corr-1' };
        let seen: unknown;
        deliver.execute.mockImplementation(() => {
            seen = RequestContext.getIds();
            return Promise.resolve('sent');
        });

        await processor.process(createJob({ username: 'ivan', message: 'Fix', requestIds }));

        expect(seen).toEqual(requestIds);
    });

    it('logs an error only when all attempts are exhausted', () => {
        const { processor, logger } = setup();
        const err = new Error('telegram down');

        processor.onFailed({ id: 'job-1', attemptsMade: 2, opts: { attempts: 5 } }, err);
        expect(logger.error).not.toHaveBeenCalled();

        processor.onFailed({ id: 'job-1', attemptsMade: 5, opts: { attempts: 5 } }, err);
        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ err, jobId: 'job-1', attemptsMade: 5 }),
            'Notification failed after all attempts',
        );
    });

    it('rethrows a transient error so the queue retries', async () => {
        const { processor, deliver } = setup();
        const error = new TransientNotifyError('down');
        deliver.execute.mockRejectedValue(error);

        await expect(
            processor.process(createJob({ username: 'ivan', message: 'Fix' })),
        ).rejects.toBe(error);
    });

    it('turns a permanent error into an unrecoverable one and logs it', async () => {
        const { processor, deliver, logger } = setup();
        deliver.execute.mockRejectedValue(new PermanentNotifyError('blocked'));

        await expect(
            processor.process(createJob({ username: 'ivan', message: 'Fix' })),
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it('fails without retries on an invalid payload', async () => {
        const { processor, deliver } = setup();

        await expect(
            processor.process(createJob({ username: '', message: 'Fix' })),
        ).rejects.toBeInstanceOf(UnrecoverableError);
        expect(deliver.execute).not.toHaveBeenCalled();
    });
});
