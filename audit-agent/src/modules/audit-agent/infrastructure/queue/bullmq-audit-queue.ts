import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RequestContext } from '../../../../shared/context/request-context';
import { AuditQueue } from '../../application/audit/audit-queue';
import type { AuditJobData } from './audit-job-data';
import { AUDIT_QUEUE } from './queue.constants';

@Injectable()
export class BullmqAuditQueue extends AuditQueue {
    constructor(@InjectQueue(AUDIT_QUEUE) private readonly queue: Queue) {
        super();
    }

    async enqueue(runId: string): Promise<void> {
        const data: AuditJobData = { runId, requestIds: RequestContext.getIds() };
        await this.queue.add('run', data, { jobId: runId });
    }
}
