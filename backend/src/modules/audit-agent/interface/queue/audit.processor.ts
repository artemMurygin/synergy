import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../../../shared/context/request-context';
import { AuditDealUseCase } from '../../application/use-cases/audit-deal.use-case';
import type { AuditDealResult } from '../../application/use-cases/audit-deal.use-case';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { auditJobDataSchema } from '../../infrastructure/queue/queue-job-data';
import type { AuditJobData } from '../../infrastructure/queue/queue-job-data';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { logFailedJob } from './log-failed-job';
import type { FailedJob } from './log-failed-job';

@Processor(QUEUE_NAMES.AUDIT)
export class AuditProcessor extends WorkerHost {
    constructor(
        private readonly auditDeal: AuditDealUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(AuditProcessor.name);
    }

    async process(job: Job<AuditJobData>): Promise<AuditDealResult> {
        const parsed = auditJobDataSchema.safeParse(job.data);
        if (!parsed.success) {
            this.logger.error({ jobId: job.id }, 'Audit job payload is invalid');
            throw new UnrecoverableError('Invalid audit job payload');
        }
        const { dealId, requestIds } = parsed.data;
        const execute = (): Promise<AuditDealResult> => this.auditDeal.execute(new DealId(dealId));
        return requestIds === undefined ? execute() : RequestContext.run(requestIds, execute);
    }

    @OnWorkerEvent('failed')
    onFailed(job: FailedJob | undefined, err: Error): void {
        logFailedJob(this.logger, job, err, 'Audit');
    }
}
