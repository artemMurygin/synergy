import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Job } from 'bullmq';
import type { Histogram } from '@prometheus-io/client';
import { RequestContext } from '../../../../shared/context/request-context';
import { ProcessAuditUseCase } from '../../application/audit/process-audit.use-case';
import type { AuditAgentResult } from '../../domain/audit/audit-agent';
import type { AuditJobData } from '../../infrastructure/queue/audit-job-data';
import { AUDIT_QUEUE } from '../../infrastructure/queue/queue.constants';

export const AUDIT_JOB_DURATION_METRIC = 'audit_job_duration_seconds';

const JOB_STATUS = { COMPLETED: 'completed', FAILED: 'failed' } as const;

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
    constructor(
        private readonly processAudit: ProcessAuditUseCase,
        @InjectMetric(AUDIT_JOB_DURATION_METRIC)
        private readonly jobDuration: Histogram<'status'>,
    ) {
        super();
    }

    async process(job: Job<AuditJobData>): Promise<AuditAgentResult> {
        const { runId, requestIds } = job.data;
        const execute = (): Promise<AuditAgentResult> => this.processAudit.execute(runId);
        const stopTimer = this.jobDuration.startTimer();
        try {
            const result = await (requestIds === undefined
                ? execute()
                : RequestContext.run(requestIds, execute));
            stopTimer({ status: JOB_STATUS.COMPLETED });
            return result;
        } catch (err) {
            stopTimer({ status: JOB_STATUS.FAILED });
            throw err;
        }
    }
}
