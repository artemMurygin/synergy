import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { AgentGuide } from '../domain/agent-guide';
import { AgentGuideRepository } from '../domain/ports/agent-guide-repository.port';
import { UUID_PATTERN } from './sql-helpers';

@Injectable()
export class SlonikAgentGuideRepository extends AgentGuideRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async upsert(guide: AgentGuide): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            INSERT INTO portal_agent_guides (agent_id, body, updated_by, updated_at)
            VALUES (${guide.agentId}, ${guide.body.value}, ${guide.updatedBy},
                    ${sql.timestamp(guide.updatedAt)})
            ON CONFLICT (agent_id) DO UPDATE
               SET body = EXCLUDED.body,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = EXCLUDED.updated_at`);
    }

    async delete(agentId: string): Promise<void> {
        if (!UUID_PATTERN.test(agentId)) return;
        await this.transactions.executor().query(sql.unsafe`
            DELETE FROM portal_agent_guides WHERE agent_id = ${agentId}`);
    }
}
