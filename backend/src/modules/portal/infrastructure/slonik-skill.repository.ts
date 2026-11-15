import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { InvalidSkillTransitionError } from '../domain/errors';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { SkillStatus } from '../domain/skill-status';
import { millis, nullableTimestamp, toDate } from './sql-helpers';

const skillRow = z.object({
    id: z.string(),
    agent_id: z.string(),
    name: z.string(),
    description: z.string(),
    status: z.string(),
    created_at: z.number(),
    status_changed_at: z.number(),
    launched_at: z.number().nullable(),
    archived_at: z.number().nullable(),
});

const COLUMNS = sql.fragment`
    id, agent_id, name, description, status,
    ${millis('created_at', 'created_at')}, ${millis('status_changed_at', 'status_changed_at')},
    ${millis('launched_at', 'launched_at')}, ${millis('archived_at', 'archived_at')}`;

function toSkill(raw: unknown): Skill {
    const row = skillRow.parse(raw);
    const statusChangedAt = new Date(row.status_changed_at);
    return Skill.restore({
        id: row.id,
        agentId: row.agent_id,
        name: SkillName.of(row.name),
        description: row.description,
        status: SkillStatus.parse(row.status),
        statusChangedAt,
        launchedAt: toDate(row.launched_at),
        archivedAt: toDate(row.archived_at),
        createdAt: new Date(row.created_at),
        updatedAt: statusChangedAt,
    });
}

@Injectable()
export class SlonikSkillRepository extends SkillRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async findById(id: string): Promise<Skill | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM portal_skills WHERE id = ${id}`);
        return row === null ? null : toSkill(row);
    }

    async findForUpdate(id: string): Promise<Skill | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM portal_skills WHERE id = ${id} FOR UPDATE`);
        return row === null ? null : toSkill(row);
    }

    async save(skill: Skill, expectedStatus?: SkillStatus): Promise<void> {
        const executor = this.transactions.executor();
        if (expectedStatus === undefined) {
            await executor.query(sql.unsafe`
                INSERT INTO portal_skills
                    (id, agent_id, name, description, status, created_at, status_changed_at,
                     launched_at, archived_at)
                VALUES (${skill.id}, ${skill.agentId}, ${skill.name.value}, ${skill.description},
                        ${skill.status}, ${sql.timestamp(skill.createdAt)},
                        ${sql.timestamp(skill.statusChangedAt)},
                        ${nullableTimestamp(skill.launchedAt)},
                        ${nullableTimestamp(skill.archivedAt)})`);
            return;
        }
        const result = await executor.query(sql.unsafe`
            UPDATE portal_skills
            SET status = ${skill.status},
                status_changed_at = ${sql.timestamp(skill.statusChangedAt)},
                launched_at = ${nullableTimestamp(skill.launchedAt)},
                archived_at = ${nullableTimestamp(skill.archivedAt)}
            WHERE id = ${skill.id} AND status = ${expectedStatus}`);
        if (result.rowCount === 0) {
            throw new InvalidSkillTransitionError(expectedStatus, skill.status);
        }
    }
}
