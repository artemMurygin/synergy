import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AUDIT_STATUS } from '../../domain/audit/audit-run';
import {
    AuditAgent,
    type AuditAgentInput,
    type AuditAgentResult,
} from '../../domain/audit/audit-agent';
import { AuditRunRepository } from '../../domain/audit/audit-run.repository';

@Injectable()
export class ProcessAuditUseCase {
    constructor(
        private readonly runs: AuditRunRepository,
        private readonly agent: AuditAgent,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(ProcessAuditUseCase.name);
    }

    async execute(runId: string): Promise<AuditAgentResult> {
        const run = await this.runs.setStatus(runId, AUDIT_STATUS.RUNNING);
        try {
            const result = await this.agent.run(run.input as AuditAgentInput);
            await this.runs.setStatus(runId, AUDIT_STATUS.DONE, result);
            return result;
        } catch (err) {
            this.logger.error({ runId, err }, 'Audit failed');
            await this.runs.setStatus(runId, AUDIT_STATUS.FAILED);
            throw err;
        }
    }
}
