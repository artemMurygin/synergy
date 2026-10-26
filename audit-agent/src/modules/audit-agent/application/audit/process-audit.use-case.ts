import { Injectable, Logger } from '@nestjs/common';
import { AUDIT_STATUS } from '../../domain/audit/audit-run';
import {
    AuditAgent,
    type AuditAgentInput,
    type AuditAgentResult,
} from '../../domain/audit/audit-agent';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';

@Injectable()
export class ProcessAuditUseCase {
    private readonly logger = new Logger(ProcessAuditUseCase.name);

    constructor(
        private readonly runs: AuditRunRepository,
        private readonly agent: AuditAgent,
    ) {}

    async execute(runId: string): Promise<AuditAgentResult> {
        const run = await this.runs.setStatus(runId, AUDIT_STATUS.RUNNING);
        try {
            const result = await this.agent.run(run.input as AuditAgentInput);
            await this.runs.setStatus(runId, AUDIT_STATUS.DONE, result);
            return result;
        } catch (err) {
            this.logger.error(`Audit ${runId} failed: ${(err as Error).message}`);
            await this.runs.setStatus(runId, AUDIT_STATUS.FAILED);
            throw err;
        }
    }
}
