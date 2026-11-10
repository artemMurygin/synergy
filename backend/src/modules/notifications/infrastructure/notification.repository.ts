import { Injectable } from '@nestjs/common';
import { sql, type FragmentSqlToken, type ValueExpression } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { Notification } from '../domain/notification';
import { NotificationContent } from '../domain/notification-content';
import { NotificationTarget } from '../domain/notification-target';
import { NotificationType } from '../domain/notification-type';
import {
    NotificationRepositoryPort,
    type MarkReadResult,
    type NotificationPage,
    type NotificationPageQuery,
} from '../domain/ports/notification-repository.port';

const notificationRow = z.object({
    id: z.string(),
    recipient_id: z.string(),
    type: z.string(),
    title: z.string(),
    body: z.string(),
    target_type: z.string(),
    target_id: z.string(),
    actor_id: z.string().nullable(),
    source_event_id: z.string(),
    created_at: z.number(),
    read_at: z.number().nullable(),
});

const insertedRow = z.object({ id: z.string() });

const countRow = z.object({ count: z.number() });

const markReadRow = z.object({ found: z.number(), marked: z.number() });

const uuidSchema = z.guid();

const millis = (column: string): FragmentSqlToken =>
    sql.fragment`(extract(epoch FROM ${sql.identifier([column])}) * 1000)::float8 AS ${sql.identifier([column])}`;

const COLUMNS = sql.fragment`
    id, recipient_id, type, title, body, target_type, target_id, actor_id, source_event_id,
    ${millis('created_at')}, ${millis('read_at')}`;

function toNotification(raw: unknown): Notification {
    const row = notificationRow.parse(raw);
    return Notification.restore({
        id: row.id,
        recipientId: row.recipient_id,
        type: NotificationType.parse(row.type),
        content: NotificationContent.of({ title: row.title, body: row.body }),
        target: NotificationTarget.of({ type: row.target_type, id: row.target_id }),
        actorId: row.actor_id,
        sourceEventId: row.source_event_id,
        createdAt: new Date(row.created_at),
        readAt: row.read_at === null ? null : new Date(row.read_at),
    });
}

function nullableTimestamp(value: Date | null): ValueExpression {
    return value === null ? null : sql.timestamp(value);
}

function isUuid(value: string): boolean {
    return uuidSchema.safeParse(value).success;
}

@Injectable()
export class NotificationRepository extends NotificationRepositoryPort {
    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    async insertIgnoringDuplicates(
        notifications: readonly Notification[],
    ): Promise<Notification[]> {
        if (notifications.length === 0) return [];
        return this.transactions.run(async () => {
            const inserted: Notification[] = [];
            for (const notification of notifications) {
                if (await this.insertOne(notification)) inserted.push(notification);
            }
            return inserted;
        });
    }

    async findById(id: string): Promise<Notification | null> {
        if (!isUuid(id)) return null;
        const row = await this.transactions.executor().maybeOne(sql.unsafe`
            SELECT ${COLUMNS} FROM notifications WHERE id = ${id}`);
        return row === null ? null : toNotification(row);
    }

    async findPage(recipientId: string, query: NotificationPageQuery): Promise<NotificationPage> {
        const where = query.isUnreadOnly
            ? sql.fragment`WHERE recipient_id = ${recipientId} AND read_at IS NULL`
            : sql.fragment`WHERE recipient_id = ${recipientId}`;
        const executor = this.transactions.executor();
        const total = await executor.oneFirst(
            sql.type(countRow)`SELECT count(*)::int AS count FROM notifications ${where}`,
        );
        const rows = await executor.any(sql.unsafe`
            SELECT ${COLUMNS} FROM notifications ${where}
            ORDER BY created_at DESC, id DESC
            LIMIT ${query.limit} OFFSET ${query.page * query.limit}`);
        return { items: rows.map(toNotification), total };
    }

    async countUnread(recipientId: string): Promise<number> {
        return this.transactions.executor().oneFirst(
            sql.type(countRow)`
                SELECT count(*)::int AS count FROM notifications
                WHERE recipient_id = ${recipientId} AND read_at IS NULL`,
        );
    }

    async markRead(id: string, recipientId: string, now: Date): Promise<MarkReadResult> {
        if (!isUuid(id)) return 'not-found';
        const result = await this.transactions.executor().one(
            sql.type(markReadRow)`
                WITH target AS (
                    SELECT id, read_at FROM notifications
                    WHERE id = ${id} AND recipient_id = ${recipientId}
                    FOR UPDATE
                ), updated AS (
                    UPDATE notifications n
                    SET read_at = GREATEST(${sql.timestamp(now)}, n.created_at)
                    FROM target
                    WHERE n.id = target.id AND target.read_at IS NULL
                    RETURNING n.id
                )
                SELECT (SELECT count(*) FROM target)::int AS found,
                       (SELECT count(*) FROM updated)::int AS marked`,
        );
        if (result.found === 0) return 'not-found';
        return result.marked === 0 ? 'already-read' : 'marked';
    }

    async markAllRead(recipientId: string, now: Date): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE notifications
            SET read_at = GREATEST(${sql.timestamp(now)}, created_at)
            WHERE recipient_id = ${recipientId} AND read_at IS NULL`);
    }

    private async insertOne(notification: Notification): Promise<boolean> {
        const row = await this.transactions.executor().maybeOne(
            sql.type(insertedRow)`
                INSERT INTO notifications
                    (id, recipient_id, type, title, body, target_type, target_id, actor_id,
                     source_event_id, created_at, read_at)
                VALUES (${notification.id}, ${notification.recipientId}, ${notification.type},
                        ${notification.content.title}, ${notification.content.body},
                        ${notification.target.type}, ${notification.target.id},
                        ${notification.actorId}, ${notification.sourceEventId},
                        ${sql.timestamp(notification.createdAt)},
                        ${nullableTimestamp(notification.readAt)})
                ON CONFLICT (source_event_id, recipient_id, type) DO NOTHING
                RETURNING id`,
        );
        return row !== null;
    }
}
