import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RequestContext } from '../../../../shared/context/request-context';
import type { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { NotificationQueuePort } from '../../domain/ports/notification-queue.port';
import type { NotificationJobData } from './queue-job-data';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

@Injectable()
export class NotificationQueueAdapter extends NotificationQueuePort {
    constructor(@InjectQueue(QUEUE_NAMES.NOTIFICATION) private readonly queue: Queue) {
        super();
    }

    async enqueue(job: NotificationJob): Promise<void> {
        const data: NotificationJobData = {
            username: job.username,
            message: job.message,
            requestIds: RequestContext.getIds(),
        };
        await this.queue.add(
            JOB_NAMES.SEND_NOTIFICATION,
            data,
            job.dedupeKey === undefined ? {} : { jobId: job.dedupeKey },
        );
    }
}
