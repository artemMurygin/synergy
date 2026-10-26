import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ProcessAuditUseCase } from '../../application/audit/process-audit.use-case';
import type { AuditAgentResult } from '../../domain/audit/audit-agent';
import { AUDIT_QUEUE } from '../../infrastructure/queue/queue.constants';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
    constructor(private readonly processAudit: ProcessAuditUseCase) {
        super();
    }

    process(job: Job<{ runId: string }>): Promise<AuditAgentResult> {
        return this.processAudit.execute(job.data.runId);
    }
}
