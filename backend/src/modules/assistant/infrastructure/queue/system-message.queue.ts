import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PostSystemMessagePort } from '../../contracts/post-system-message.port';
import {
    systemMessageCommandSchema,
    type SystemMessageCommand,
} from '../../contracts/system-message.command';
import {
    SYSTEM_MESSAGE_JOB_NAME,
    SYSTEM_MESSAGE_QUEUE_NAME,
} from './system-message-queue.constants';

@Injectable()
export class SystemMessageQueue extends PostSystemMessagePort {
    constructor(@InjectQueue(SYSTEM_MESSAGE_QUEUE_NAME) private readonly queue: Queue) {
        super();
    }

    // BullMQ returns the existing job for a repeated jobId instead of failing.
    async request(command: SystemMessageCommand): Promise<void> {
        const data = systemMessageCommandSchema.parse(command);
        await this.queue.add(SYSTEM_MESSAGE_JOB_NAME, data, { jobId: data.dedupKey });
    }
}
