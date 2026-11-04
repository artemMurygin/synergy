import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool, type DatabaseTransactionConnection } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import { ProgramsSyncError, type RunFailure } from '../application/errors/programs-sync.error';
import {
    createQueuedRun,
    failRun,
    startRun,
    succeedRun,
    type NewProgramsSyncRun,
    type ProgramsSyncRunRecord,
} from '../application/models/programs-sync-run';
import type {
    CursorPage,
    ListProgramsSyncRunsQueryInput,
    ProgramsSyncRunSummary,
} from '../application/models/sync-commands';
import type { SyncRunStorePort } from '../application/ports/programs-etl.ports';

const timestamp = z.union([z.date(), z.number(), z.string()]).transform((v) => new Date(v));

const rowSchema = z.object({
    id: z.string(),
    group_id: z.string(),
    previous_run_id: z.string().nullable(),
    trigger: z.enum(['scheduled', 'retry']),
    status: z.enum(['queued', 'running', 'succeeded', 'failed']),
    created_at: timestamp,
    started_at: timestamp.nullable(),
    finished_at: timestamp.nullable(),
    failure_code: z.string().nullable(),
    failure_message: z.string().nullable(),
    failure_retryable: z.boolean().nullable(),
    changed_sources: z.array(z.object({ sourceId: z.string(), observedHash: z.string() })),
});

const cursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });

const SELECT_COLUMNS = sql.fragment`
    id, group_id, previous_run_id, trigger, status, created_at, started_at, finished_at,
    failure_code, failure_message, failure_retryable, changed_sources`;

function toRecord(raw: unknown): ProgramsSyncRunRecord {
    const row = rowSchema.parse(raw);
    return {
        id: row.id,
        groupId: row.group_id,
        ...(row.previous_run_id === null ? {} : { previousRunId: row.previous_run_id }),
        trigger: row.trigger,
        status: row.status,
        changedSources: row.changed_sources,
        createdAt: row.created_at,
        ...(row.started_at === null ? {} : { startedAt: row.started_at }),
        ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
        ...(row.failure_code === null
            ? {}
            : {
                  failure: {
                      code: row.failure_code,
                      message: row.failure_message ?? '',
                      retryable: row.failure_retryable ?? false,
                  },
              }),
    };
}

function toSummary(record: ProgramsSyncRunRecord): ProgramsSyncRunSummary {
    return {
        id: record.id,
        groupId: record.groupId,
        status: record.status,
        trigger: record.trigger,
        ...(record.previousRunId === undefined ? {} : { previousRunId: record.previousRunId }),
        createdAt: record.createdAt,
        ...(record.finishedAt === undefined ? {} : { finishedAt: record.finishedAt }),
    };
}

function encodeCursor(record: ProgramsSyncRunRecord): string {
    return Buffer.from(
        JSON.stringify({ createdAt: record.createdAt.toISOString(), id: record.id }),
    ).toString('base64url');
}

function decodeCursor(cursor: string): z.infer<typeof cursorSchema> {
    try {
        return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    } catch {
        throw new ProgramsSyncError('INVALID_WORKFLOW_DATA', 'Malformed run list cursor');
    }
}

/** Persists only run metadata and a brief failure reason, never sheet payloads. */
@Injectable()
export class PostgresSyncRunStore implements SyncRunStorePort {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {}

    async createQueued(input: NewProgramsSyncRun): Promise<ProgramsSyncRunRecord> {
        const run = createQueuedRun(input);
        await this.pool.query(sql.unsafe`
            INSERT INTO programs_sync_run
                (id, group_id, previous_run_id, trigger, status, created_at, changed_sources)
            VALUES (${run.id}, ${run.groupId}, ${run.previousRunId ?? null}, ${run.trigger},
                    ${run.status}, ${run.createdAt.toISOString()},
                    ${JSON.stringify(run.changedSources)}::jsonb)
        `);
        return run;
    }

    async markRunning(runId: string): Promise<void> {
        await this.transition(runId, (run) => {
            const next = startRun(run, new Date());
            return next === run ? null : next;
        });
    }

    async markSucceeded(runId: string): Promise<void> {
        await this.transition(runId, (run) => succeedRun(run, new Date()));
    }

    async markFailed(input: { runId: string; failure: RunFailure }): Promise<void> {
        await this.transition(input.runId, (run) =>
            failRun(run, { failure: input.failure, now: new Date() }),
        );
    }

    async findById(runId: string): Promise<ProgramsSyncRunRecord | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${SELECT_COLUMNS} FROM programs_sync_run WHERE id = ${runId}
        `);
        return row === null ? null : toRecord(row);
    }

    async list(input: ListProgramsSyncRunsQueryInput): Promise<CursorPage<ProgramsSyncRunSummary>> {
        const conditions = [sql.fragment`TRUE`];
        if (input.groupId !== undefined) conditions.push(sql.fragment`group_id = ${input.groupId}`);
        if (input.status !== undefined) conditions.push(sql.fragment`status = ${input.status}`);
        if (input.cursor !== undefined) {
            const cursor = decodeCursor(input.cursor);
            conditions.push(
                sql.fragment`(created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`,
            );
        }
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${SELECT_COLUMNS} FROM programs_sync_run
            WHERE ${sql.join(conditions, sql.fragment` AND `)}
            ORDER BY created_at DESC, id DESC
            LIMIT ${input.limit + 1}
        `);
        const records = rows.map(toRecord);
        const pageRecords = records.slice(0, input.limit);
        const last = pageRecords.at(-1);
        const items = pageRecords.map(toSummary);
        return records.length > input.limit && last !== undefined
            ? { items, nextCursor: encodeCursor(last) }
            : { items };
    }

    /**
     * Loads the run under a row lock, applies the application-level transition and
     * persists the result. A null result means "no change" (idempotent transition).
     */
    private async transition(
        runId: string,
        apply: (run: ProgramsSyncRunRecord) => ProgramsSyncRunRecord | null,
    ): Promise<void> {
        await this.pool.transaction(async (tx: DatabaseTransactionConnection) => {
            const row = await tx.maybeOne(sql.unsafe`
                SELECT ${SELECT_COLUMNS} FROM programs_sync_run WHERE id = ${runId} FOR UPDATE
            `);
            if (row === null) {
                throw new ProgramsSyncError('INVALID_WORKFLOW_DATA', `Unknown sync run: ${runId}`);
            }
            const next = apply(toRecord(row));
            if (next === null) return;
            await tx.query(sql.unsafe`
                UPDATE programs_sync_run
                SET status = ${next.status},
                    started_at = ${next.startedAt?.toISOString() ?? null},
                    finished_at = ${next.finishedAt?.toISOString() ?? null},
                    failure_code = ${next.failure?.code ?? null},
                    failure_message = ${next.failure?.message ?? null},
                    failure_retryable = ${next.failure?.retryable ?? null}
                WHERE id = ${runId}
            `);
        });
    }
}
