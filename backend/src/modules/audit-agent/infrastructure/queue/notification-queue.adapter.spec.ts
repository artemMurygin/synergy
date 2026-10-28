import type { JobsOptions, Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '../../../../shared/context/request-context';
import { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { NotificationQueueAdapter } from './notification-queue.adapter';
import type { NotificationJobData } from './queue-job-data';
import { JOB_NAMES } from './queue.constants';

const REQUEST_IDS = { requestId: 'req-1', correlationId: 'corr-1' };

describe('NotificationQueueAdapter', () => {
    it('enqueues send-notification with username and message', async () => {
        const add = vi
            .fn<(name: string, data: NotificationJobData) => Promise<void>>()
            .mockResolvedValue();
        const queue = new NotificationQueueAdapter({ add } as unknown as Queue);

        await queue.enqueue(new NotificationJob({ username: 'ivan', message: 'Fix the deal' }));

        expect(add).toHaveBeenCalledTimes(1);
        const [name, data] = add.mock.calls[0];
        expect(name).toBe(JOB_NAMES.SEND_NOTIFICATION);
        expect(data).toEqual({ username: 'ivan', message: 'Fix the deal', requestIds: undefined });
    });

    it('uses the dedupe key as the jobId so a retried audit does not notify twice', async () => {
        const add = vi
            .fn<(name: string, data: NotificationJobData, opts: JobsOptions) => Promise<void>>()
            .mockResolvedValue();
        const queue = new NotificationQueueAdapter({ add } as unknown as Queue);

        await queue.enqueue(
            new NotificationJob({ username: 'ivan', message: 'Hi', dedupeKey: 'notify-1-2-ivan' }),
        );

        expect(add.mock.calls[0][2].jobId).toBe('notify-1-2-ivan');
    });

    it('carries request ids into the payload', async () => {
        const add = vi
            .fn<(name: string, data: NotificationJobData) => Promise<void>>()
            .mockResolvedValue();
        const queue = new NotificationQueueAdapter({ add } as unknown as Queue);

        await RequestContext.run(REQUEST_IDS, () =>
            queue.enqueue(new NotificationJob({ username: 'ivan', message: 'Hi' })),
        );

        expect(add.mock.calls[0][1].requestIds).toEqual(REQUEST_IDS);
    });
});
