import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditQueue } from '../../application/audit/audit-queue';
import { AUDIT_QUEUE } from './queue.constants';

@Injectable()
export class BullmqAuditQueue extends AuditQueue {
    constructor(@InjectQueue(AUDIT_QUEUE) private readonly queue: Queue) {
        super();
    }

    async enqueue(runId: string): Promise<void> {
        await this.queue.add('run', { runId }, { jobId: runId });
    }
}
