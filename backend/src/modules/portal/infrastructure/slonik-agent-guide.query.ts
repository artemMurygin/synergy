import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { formatFullName } from '../../../shared/people/full-name';
import { AgentGuideQuery, type GuideRecord } from '../domain/ports/agent-guide-query.port';
import { millis, UUID_PATTERN } from './sql-helpers';

const guideRow = z.object({
    body: z.string(),
    updated_at: z.number(),
    updated_by: z.string(),
    login: z.string(),
    last_name: z.string().nullable(),
    first_name: z.string().nullable(),
    middle_name: z.string().nullable(),
});

@Injectable()
export class SlonikAgentGuideQuery extends AgentGuideQuery {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async find(agentId: string): Promise<GuideRecord | null> {
        if (!UUID_PATTERN.test(agentId)) return null;
        const raw = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT g.body, ${millis('g.updated_at', 'updated_at')}, g.updated_by, u.login,
                   p.last_name, p.first_name, p.middle_name
              FROM portal_agent_guides g
              JOIN auth_users u ON u.id = g.updated_by
              LEFT JOIN auth_user_profiles p ON p.user_id = g.updated_by
             WHERE g.agent_id = ${agentId}`);
        if (raw === null) return null;
        const row = guideRow.parse(raw);
        return {
            body: row.body,
            updatedAt: new Date(row.updated_at),
            updatedBy: {
                id: row.updated_by,
                login: row.login,
                fullName: formatFullName(
                    {
                        lastName: row.last_name,
                        firstName: row.first_name,
                        middleName: row.middle_name,
                    },
                    row.login,
                ),
            },
        };
    }
}
