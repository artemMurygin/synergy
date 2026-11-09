import { Inject, Injectable } from '@nestjs/common';
import { sql, type DatabasePool, type FragmentSqlToken, type ValueExpression } from 'slonik';
import { z } from 'zod';
import { PG_POOL } from '../../../database/postgres/database.constants';
import {
    TaskRepository,
    type TaskPage,
    type TaskPageRequest,
} from '../domain/ports/task-repository.port';
import { TaskNotFoundError } from '../domain/errors';
import { Task } from '../domain/task';
import type { TaskFilter } from '../domain/task-filter';
import type { TaskSort, TaskSortField } from '../domain/task-sort';
import { TaskStatus } from '../domain/task-status';
import { TaskTitle } from '../domain/task-title';

const taskRow = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.string(),
    deadline: z.number().nullable(),
    creator_id: z.string(),
    assignee_id: z.string().nullable(),
    created_at: z.number(),
    updated_at: z.number(),
    completed_at: z.number().nullable(),
    deleted_at: z.number().nullable(),
});

const watcherRow = z.object({ task_id: z.string(), user_id: z.string() });

const millis = (column: string): FragmentSqlToken =>
    sql.fragment`(extract(epoch FROM ${sql.identifier([column])}) * 1000)::float8 AS ${sql.identifier([column])}`;

const COLUMNS = sql.fragment`
    id, title, description, status, creator_id, assignee_id,
    ${millis('deadline')}, ${millis('created_at')}, ${millis('updated_at')},
    ${millis('completed_at')}, ${millis('deleted_at')}`;

// Whitelist: sort field from the domain -> column; never interpolate user input.
const SORT_COLUMNS: Record<TaskSortField, string> = {
    deadline: 'deadline',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
};

const toDate = (value: number | null): Date | null => (value === null ? null : new Date(value));

function toTask(raw: unknown, watcherIds: string[]): Task {
    const row = taskRow.parse(raw);
    return Task.restore({
        id: row.id,
        title: TaskTitle.of(row.title),
        description: row.description,
        status: TaskStatus.parse(row.status),
        deadline: toDate(row.deadline),
        creatorId: row.creator_id,
        assigneeId: row.assignee_id,
        watcherIds,
        completedAt: toDate(row.completed_at),
        deletedAt: toDate(row.deleted_at),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
    });
}

/** Escapes LIKE wildcards so the substring is matched literally. */
function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buildWhere(filter: TaskFilter): FragmentSqlToken {
    const conditions: FragmentSqlToken[] = [sql.fragment`t.deleted_at IS NULL`];
    if (filter.status !== undefined) conditions.push(sql.fragment`t.status = ${filter.status}`);
    if (filter.creatorId !== undefined) {
        conditions.push(sql.fragment`t.creator_id = ${filter.creatorId}`);
    }
    if (filter.assigneeId !== undefined) {
        conditions.push(sql.fragment`t.assignee_id = ${filter.assigneeId}`);
    }
    if (filter.watcherId !== undefined) {
        conditions.push(sql.fragment`EXISTS (
            SELECT 1 FROM task_watcher w WHERE w.task_id = t.id AND w.user_id = ${filter.watcherId})`);
    }
    if (filter.overdue === true) {
        conditions.push(sql.fragment`(t.deadline < now() AND t.status <> 'done')`);
    }
    if (filter.titleContains !== undefined) {
        conditions.push(
            sql.fragment`t.title ILIKE ${`%${escapeLike(filter.titleContains)}%`} ESCAPE '\\'`,
        );
    }
    return sql.fragment`WHERE ${sql.join(conditions, sql.fragment` AND `)}`;
}

function buildOrderBy(sort: TaskSort): FragmentSqlToken {
    const column = sql.identifier(['t', SORT_COLUMNS[sort.field]]);
    const direction = sort.direction === 'asc' ? sql.fragment`ASC` : sql.fragment`DESC`;
    return sql.fragment`ORDER BY ${column} ${direction} NULLS LAST, t.id ${direction}`;
}

@Injectable()
export class SlonikTaskRepository extends TaskRepository {
    constructor(@Inject(PG_POOL) private readonly pool: DatabasePool) {
        super();
    }

    async findById(id: string): Promise<Task | null> {
        const row = await this.pool.maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM task WHERE id = ${id} AND deleted_at IS NULL`);
        if (row === null) return null;
        const watchers = await this.loadWatchers([id]);
        return toTask(row, watchers.get(id) ?? []);
    }

    async save(task: Task): Promise<void> {
        await this.pool.transaction(async (tx) => {
            // Serialize writers of one task and refuse to touch a task deleted in the meantime.
            const current = await tx.maybeOne(sql.unsafe`
                SELECT (extract(epoch FROM deleted_at) * 1000)::float8 AS deleted_at
                FROM task WHERE id = ${task.id} FOR UPDATE`);
            if (current !== null && task.deletedAt === null) {
                if (
                    z.object({ deleted_at: z.number().nullable() }).parse(current).deleted_at !==
                    null
                ) {
                    throw new TaskNotFoundError(task.id);
                }
            }
            await tx.query(sql.unsafe`
                INSERT INTO task
                    (id, title, description, status, deadline, creator_id, assignee_id,
                     created_at, updated_at, completed_at, deleted_at)
                VALUES (${task.id}, ${task.title.value}, ${task.description}, ${task.status},
                        ${nullableTimestamp(task.deadline)}, ${task.creatorId}, ${task.assigneeId},
                        ${sql.timestamp(task.createdAt)}, ${sql.timestamp(task.updatedAt)},
                        ${nullableTimestamp(task.completedAt)}, ${nullableTimestamp(task.deletedAt)})
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    status = EXCLUDED.status,
                    deadline = EXCLUDED.deadline,
                    assignee_id = EXCLUDED.assignee_id,
                    updated_at = EXCLUDED.updated_at,
                    completed_at = EXCLUDED.completed_at,
                    deleted_at = COALESCE(task.deleted_at, EXCLUDED.deleted_at)`);
            await tx.query(sql.unsafe`DELETE FROM task_watcher WHERE task_id = ${task.id}`);
            if (task.watcherIds.length > 0) {
                await tx.query(sql.unsafe`
                    INSERT INTO task_watcher (task_id, user_id)
                    SELECT ${task.id}, unnest(${sql.array([...task.watcherIds], 'uuid')})`);
            }
        });
    }

    async list(filter: TaskFilter, sort: TaskSort, page: TaskPageRequest): Promise<TaskPage> {
        const where = buildWhere(filter);
        const total = await this.pool.oneFirst(
            sql.type(z.object({ count: z.number() }))`
                SELECT count(*)::int AS count FROM task t ${where}`,
        );
        const rows = await this.pool.any(sql.unsafe`
            SELECT ${COLUMNS} FROM task t ${where} ${buildOrderBy(sort)}
            LIMIT ${page.limit} OFFSET ${page.page * page.limit}`);
        const watchers = await this.loadWatchers(rows.map((row) => taskRow.parse(row).id));
        return {
            items: rows.map((row) => toTask(row, watchers.get(taskRow.parse(row).id) ?? [])),
            total,
        };
    }

    private async loadWatchers(taskIds: string[]): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>();
        if (taskIds.length === 0) return result;
        const rows = await this.pool.any(sql.unsafe`
            SELECT task_id, user_id FROM task_watcher
            WHERE task_id = ANY(${sql.array(taskIds, 'uuid')})
            ORDER BY user_id`);
        for (const raw of rows) {
            const row = watcherRow.parse(raw);
            const list = result.get(row.task_id) ?? [];
            list.push(row.user_id);
            result.set(row.task_id, list);
        }
        return result;
    }
}

function nullableTimestamp(value: Date | null): ValueExpression {
    return value === null ? null : sql.timestamp(value);
}
