import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RequestContext } from '../../../../shared/context/request-context';
import { AuditQueuePort } from '../../domain/ports/audit-queue.port';
import type { DealId } from '../../domain/value-objects/deal-id.value-object';
import type { AuditJobData } from './queue-job-data';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

@Injectable()
export class AuditQueueAdapter extends AuditQueuePort {
    constructor(@InjectQueue(QUEUE_NAMES.AUDIT) private readonly queue: Queue) {
        super();
    }

    async enqueue(dealId: DealId): Promise<void> {
        const data: AuditJobData = {
            dealId: dealId.value,
            requestIds: RequestContext.getIds(),
        };
        await this.queue.add(JOB_NAMES.AUDIT_DEAL, data, { jobId: `audit-${dealId.value}` });
    }
}
