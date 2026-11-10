import { Injectable } from '@nestjs/common';
import { sql } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import {
    OutboxStorePort,
    type ClaimedDelivery,
    type NewOutboxEvent,
} from '../application/outbox-store.port';
import { OutboxSettings } from './outbox-settings';

const MAX_ERROR_LENGTH = 2000;

const claimedRow = z.object({
    event_id: z.string(),
    subscriber: z.string(),
    attempts: z.number(),
    event_type: z.string(),
    aggregate_id: z.string(),
    payload: z.unknown(),
    metadata: z.unknown(),
    created_at: z.number(),
});

const pendingCountRow = z.object({ subscriber: z.string(), count: z.number() });

const truncateError = (error: string): string => error.slice(0, MAX_ERROR_LENGTH);

@Injectable()
export class OutboxStore extends OutboxStorePort {
    constructor(
        private readonly transactions: TransactionRunnerPort,
        private readonly settings: OutboxSettings,
    ) {
        super();
    }

    async insertEvents(events: readonly NewOutboxEvent[]): Promise<void> {
        const connection = this.transactions.executor();
        for (const event of events) {
            await connection.query(sql.unsafe`
                INSERT INTO outbox_events (id, event_type, aggregate_id, payload, metadata, created_at)
                VALUES (${event.id}, ${event.eventType}, ${event.aggregateId},
                        ${JSON.stringify(event.payload)}::jsonb,
                        ${JSON.stringify(event.metadata)}::jsonb, clock_timestamp())`);
            if (event.subscribers.length === 0) continue;
            await connection.query(sql.unsafe`
                INSERT INTO outbox_deliveries (event_id, subscriber)
                SELECT ${event.id}, unnest(${sql.array([...event.subscribers], 'text')})`);
        }
    }

    async claimDueDeliveries(limit: number, now: Date): Promise<ClaimedDelivery[]> {
        const leaseUntil = new Date(now.getTime() + this.settings.claimLeaseMs);
        const rows = await this.transactions.executor().any(sql.unsafe`
            WITH due AS (
                SELECT d.event_id, d.subscriber, e.created_at
                FROM outbox_deliveries d
                JOIN outbox_events e ON e.id = d.event_id
                WHERE d.status = 'pending'
                  AND d.next_attempt_at <= ${sql.timestamp(now)}
                  AND NOT EXISTS (
                      SELECT 1
                      FROM outbox_deliveries earlier
                      JOIN outbox_events earlier_event ON earlier_event.id = earlier.event_id
                      WHERE earlier.subscriber = d.subscriber
                        AND earlier.status = 'pending'
                        AND earlier_event.aggregate_id = e.aggregate_id
                        AND (earlier_event.created_at, earlier_event.id) < (e.created_at, e.id)
                  )
                ORDER BY e.created_at, d.event_id, d.subscriber
                LIMIT ${limit}
                FOR UPDATE OF d SKIP LOCKED
            ),
            claimed AS (
                UPDATE outbox_deliveries d
                SET attempts = d.attempts + 1, next_attempt_at = ${sql.timestamp(leaseUntil)}
                FROM due
                WHERE d.event_id = due.event_id AND d.subscriber = due.subscriber
                RETURNING d.event_id, d.subscriber, d.attempts
            )
            SELECT claimed.event_id, claimed.subscriber, claimed.attempts,
                   e.event_type, e.aggregate_id, e.payload, e.metadata,
                   (extract(epoch FROM e.created_at) * 1000)::float8 AS created_at
            FROM claimed
            JOIN outbox_events e ON e.id = claimed.event_id
            ORDER BY e.created_at, claimed.event_id, claimed.subscriber`);
        return rows.map((raw) => {
            const row = claimedRow.parse(raw);
            return {
                eventId: row.event_id,
                subscriber: row.subscriber,
                attempts: row.attempts,
                event: {
                    id: row.event_id,
                    eventType: row.event_type,
                    aggregateId: row.aggregate_id,
                    payload: row.payload,
                    metadata: row.metadata,
                    createdAt: new Date(row.created_at),
                },
            };
        });
    }

    async markDone(eventId: string, subscriber: string, processedAt: Date): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE outbox_deliveries
            SET status = 'done', last_error = NULL, processed_at = ${sql.timestamp(processedAt)}
            WHERE event_id = ${eventId} AND subscriber = ${subscriber}`);
    }

    async scheduleRetry(
        eventId: string,
        subscriber: string,
        attempt: number,
        nextAttemptAt: Date,
        error: string,
    ): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE outbox_deliveries
            SET status = 'pending', attempts = ${attempt},
                next_attempt_at = ${sql.timestamp(nextAttemptAt)},
                last_error = ${truncateError(error)}
            WHERE event_id = ${eventId} AND subscriber = ${subscriber}`);
    }

    async markFailed(
        eventId: string,
        subscriber: string,
        attempts: number,
        error: string,
        processedAt: Date,
    ): Promise<void> {
        await this.transactions.executor().query(sql.unsafe`
            UPDATE outbox_deliveries
            SET status = 'failed', attempts = ${attempts},
                last_error = ${truncateError(error)}, processed_at = ${sql.timestamp(processedAt)}
            WHERE event_id = ${eventId} AND subscriber = ${subscriber}`);
    }

    async deleteProcessedBefore(before: Date): Promise<number> {
        const result = await this.transactions.executor().query(sql.unsafe`
            DELETE FROM outbox_events e
            WHERE e.created_at < ${sql.timestamp(before)}
              AND NOT EXISTS (
                  SELECT 1 FROM outbox_deliveries d
                  WHERE d.event_id = e.id AND d.status <> 'done'
              )`);
        return result.rowCount;
    }

    async countPendingBySubscriber(): Promise<ReadonlyMap<string, number>> {
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT subscriber, count(*)::int AS count
            FROM outbox_deliveries
            WHERE status = 'pending'
            GROUP BY subscriber`);
        return new Map(
            rows.map((raw) => {
                const row = pendingCountRow.parse(raw);
                return [row.subscriber, row.count];
            }),
        );
    }
}
