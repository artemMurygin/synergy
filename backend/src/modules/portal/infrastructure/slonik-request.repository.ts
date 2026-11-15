import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { LinkedRequestSnapshot } from '../contracts/linked-request-snapshot';
import {
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotFoundError,
    RequestNotTakenError,
} from '../domain/errors';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { RequestDecision, type RequestStatusKind } from '../domain/request-decision';
import { RequestTitle } from '../domain/request-title';
import { millis, nullableTimestamp, toDate } from './sql-helpers';

const requestRow = z.object({
    id: z.string(),
    author_id: z.string(),
    title: z.string(),
    description: z.string(),
    frequency_count: z.number(),
    frequency_period: z.string(),
    minutes_per_run: z.number(),
    people_count: z.number(),
    decision: z.enum(['new', 'under_review', 'accepted', 'rejected']),
    reviewer_id: z.string().nullable(),
    taken_at: z.number().nullable(),
    effort_hours: z.number().nullable(),
    skill_id: z.string().nullable(),
    reject_reason: z.string().nullable(),
    decided_by: z.string().nullable(),
    decided_at: z.number().nullable(),
    created_at: z.number(),
});

const snapshotRow = z.object({ id: z.string(), author_id: z.string(), title: z.string() });

const COLUMNS = sql.fragment`
    id, author_id, title, description, frequency_count, frequency_period, minutes_per_run,
    people_count, decision, reviewer_id, effort_hours, skill_id, reject_reason, decided_by,
    ${millis('taken_at', 'taken_at')}, ${millis('decided_at', 'decided_at')}, ${millis('created_at', 'created_at')}`;

function toDecision(row: z.infer<typeof requestRow>): RequestDecision {
    if (row.decision === 'new') return RequestDecision.new();
    const takenAt = toDate(row.taken_at);
    if (row.reviewer_id === null || takenAt === null) {
        throw new Error(`Request ${row.id} is taken but has no reviewer_id/taken_at`);
    }
    if (row.decision === 'under_review') {
        return RequestDecision.underReview(row.reviewer_id, takenAt);
    }
    const decidedAt = toDate(row.decided_at);
    if (decidedAt === null || row.decided_by === null) {
        throw new Error(`Request ${row.id} has a decision without decided_by/decided_at`);
    }
    if (row.decision === 'accepted') {
        if (row.skill_id === null) throw new Error(`Accepted request ${row.id} has no skill`);
        return RequestDecision.accepted(
            row.reviewer_id,
            takenAt,
            row.skill_id,
            row.effort_hours,
            row.decided_by,
            decidedAt,
        );
    }
    if (row.reject_reason === null) throw new Error(`Rejected request ${row.id} has no reason`);
    return RequestDecision.rejected(
        row.reviewer_id,
        takenAt,
        row.reject_reason,
        row.decided_by,
        decidedAt,
    );
}

function toRequest(raw: unknown): IdeaRequest {
    const row = requestRow.parse(raw);
    const createdAt = new Date(row.created_at);
    return IdeaRequest.restore({
        id: row.id,
        authorId: row.author_id,
        title: RequestTitle.of(row.title),
        description: row.description,
        frequency: Frequency.of(row.frequency_count, row.frequency_period),
        minutesPerRun: row.minutes_per_run,
        peopleCount: row.people_count,
        decision: toDecision(row),
        createdAt,
        updatedAt: toDate(row.decided_at) ?? toDate(row.taken_at) ?? createdAt,
    });
}

@Injectable()
export class SlonikRequestRepository extends RequestRepository {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async save(request: IdeaRequest, expected?: RequestStatusKind): Promise<void> {
        const executor = this.transactions.executor();
        if (expected === undefined) {
            if (request.decision.kind !== 'new') {
                throw new Error(`Request ${request.id}: a decided request needs the expected status`);
            }
            await executor.query(sql.unsafe`
                INSERT INTO portal_requests
                    (id, author_id, title, description, frequency_count, frequency_period,
                     minutes_per_run, people_count, decision, created_at)
                VALUES (${request.id}, ${request.authorId}, ${request.title.value},
                        ${request.description}, ${request.frequency.count},
                        ${request.frequency.period}, ${request.minutesPerRun},
                        ${request.peopleCount}, 'new', ${sql.timestamp(request.createdAt)})
                ON CONFLICT (id) DO NOTHING`);
            return;
        }
        const decision = request.decision;
        const reviewerId = decision.kind === 'new' ? null : decision.reviewerId;
        const takenAt = decision.kind === 'new' ? null : decision.takenAt;
        const effort = decision.kind === 'accepted' ? decision.effortHours : null;
        const skillId = decision.kind === 'accepted' ? decision.skillId : null;
        const reason = decision.kind === 'rejected' ? decision.reason : null;
        const decidedBy =
            decision.kind === 'accepted' || decision.kind === 'rejected' ? decision.decidedBy : null;
        const decidedAt =
            decision.kind === 'accepted' || decision.kind === 'rejected' ? decision.decidedAt : null;
        const result = await executor.query(sql.unsafe`
            UPDATE portal_requests
            SET decision = ${decision.kind},
                reviewer_id = ${reviewerId},
                taken_at = ${nullableTimestamp(takenAt)},
                effort_hours = ${effort},
                skill_id = ${skillId},
                reject_reason = ${reason},
                decided_by = ${decidedBy},
                decided_at = ${nullableTimestamp(decidedAt)}
            WHERE id = ${request.id} AND decision = ${expected}`);
        if (result.rowCount > 0) return;
        const actual = await executor.maybeOne(
            sql.unsafe`SELECT decision FROM portal_requests WHERE id = ${request.id}`,
        );
        if (actual === null) throw new RequestNotFoundError(request.id);
        const kind = z.object({ decision: z.string() }).parse(actual).decision;
        if (kind === 'under_review' && expected === 'new') {
            throw new RequestAlreadyTakenError(request.id);
        }
        if (kind === 'new') throw new RequestNotTakenError(request.id);
        throw new RequestAlreadyDecidedError(request.id);
    }

    async findById(id: string): Promise<IdeaRequest | null> {
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM portal_requests WHERE id = ${id}`);
        return row === null ? null : toRequest(row);
    }

    async listLinkedToSkill(skillId: string): Promise<LinkedRequestSnapshot[]> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT id, author_id, title FROM portal_requests
            WHERE skill_id = ${skillId} AND decision = 'accepted'
            ORDER BY created_at, id`);
        return rows.map((raw) => {
            const row = snapshotRow.parse(raw);
            return { requestId: row.id, authorId: row.author_id, title: row.title };
        });
    }
}
