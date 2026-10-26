import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { AuditRunRepository } from '../database/audit-run.repository';
import { AgentService } from '../agent/agent.service';
import { AUDIT_QUEUE } from './queue.constants';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
    private readonly logger = new Logger(AuditProcessor.name);

    constructor(
        private readonly runs: AuditRunRepository,
        private readonly agent: AgentService,
    ) {
        super();
    }

    async process(job: Job<{ runId: string }>) {
        const { runId } = job.data;
        const run = await this.runs.setStatus(runId, 'running');
        try {
            const result = await this.agent.run(run.input as { query: string });
            await this.runs.setStatus(runId, 'done', result);
            return result;
        } catch (err) {
            this.logger.error(`Audit ${runId} failed: ${(err as Error).message}`);
            await this.runs.setStatus(runId, 'failed');
            throw err;
        }
    }
}
