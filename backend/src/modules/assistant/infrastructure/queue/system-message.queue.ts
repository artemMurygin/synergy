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

/** Posting through BullMQ: retries while the chat has an active run, one job per dedupKey. */
@Injectable()
export class SystemMessageQueue extends PostSystemMessagePort {
    constructor(@InjectQueue(SYSTEM_MESSAGE_QUEUE_NAME) private readonly queue: Queue) {
        super();
    }

    // BullMQ при существующем `jobId` возвращает прежний job, ошибки нет.
    async request(command: SystemMessageCommand): Promise<void> {
        const data = systemMessageCommandSchema.parse(command);
        await this.queue.add(SYSTEM_MESSAGE_JOB_NAME, data, { jobId: data.dedupKey });
    }
}
