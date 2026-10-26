import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RequestContext } from '../../../../shared/context/request-context';
import { ProcessAuditUseCase } from '../../application/audit/process-audit.use-case';
import type { AuditAgentResult } from '../../domain/audit/audit-agent';
import type { AuditJobData } from '../../infrastructure/queue/audit-job-data';
import { AUDIT_QUEUE } from '../../infrastructure/queue/queue.constants';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
    constructor(private readonly processAudit: ProcessAuditUseCase) {
        super();
    }

    process(job: Job<AuditJobData>): Promise<AuditAgentResult> {
        const { runId, requestIds } = job.data;
        const execute = (): Promise<AuditAgentResult> => this.processAudit.execute(runId);
        return requestIds === undefined ? execute() : RequestContext.run(requestIds, execute);
    }
}
