import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import type { DeliveryReservation } from '../../domain/ports/telegram-delivery-log.port';
import { TelegramDeliveryLog } from './telegram-delivery-log';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-03-01T10:00:00.000Z');
const RESERVATION_MS = 120_000;
const LARGE_MESSAGE_ID = 9_007_199_254_740_995n;

function at(offsetMs: number): Date {
    return new Date(T0.getTime() + offsetMs);
}

interface DeliveryRow {
    readonly status: string;
    readonly reserved_at: Date;
    readonly message_id: string | null;
    readonly sent_at: Date | null;
    readonly user_id: string;
}

describe.skipIf(adminUrl === undefined)('TelegramDeliveryLog', () => {
    const databaseName = `telegram_deliveries_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let deliveryLog: TelegramDeliveryLog;
    let boris: string;

    async function addNotification(): Promise<string> {
        const id = randomUUID();
        await client.query(
            `INSERT INTO notifications (id, recipient_id, type, title, target_type, target_id, source_event_id)
             VALUES ($1, $2, 'task.assigned', 'Вам назначена задача', 'task', $3, $4)`,
            [id, boris, randomUUID(), randomUUID()],
        );
        return id;
    }

    async function rowOf(notificationId: string): Promise<DeliveryRow | null> {
        const result = await client.query<DeliveryRow>(
            `SELECT status, reserved_at, message_id::text AS message_id, sent_at, user_id
             FROM telegram_deliveries WHERE notification_id = $1`,
            [notificationId],
        );
        return result.rows[0] ?? null;
    }

    function reserve(notificationId: string, now: Date): Promise<DeliveryReservation> {
        return deliveryLog.reserve({
            notificationId,
            userId: boris,
            now,
            reservationMs: RESERVATION_MS,
        });
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${databaseName}`);
        await admin.end();
        const databaseUrl = withDatabase(adminUrl ?? '', databaseName);
        await migrate(databaseUrl);
        client = new Client({ connectionString: databaseUrl });
        await client.connect();
        pool = await createPool(databaseUrl);
        deliveryLog = new TelegramDeliveryLog(
            new TransactionRunner(pool, new PinoLogger({ pinoHttp: { level: 'silent' } })),
        );
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM telegram_deliveries');
        await client.query('DELETE FROM notifications');
        await client.query('DELETE FROM auth_users');
        boris = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [boris, 'boris', '$argon2id$fake'],
        );
    });

    describe('reserve', () => {
        it('reserves the first delivery and stores a sending row', async () => {
            const notificationId = await addNotification();

            expect(await reserve(notificationId, T0)).toBe('reserved');

            const row = await rowOf(notificationId);
            expect(row?.status).toBe('sending');
            expect(row?.user_id).toBe(boris);
            expect(row?.reserved_at).toEqual(T0);
            expect(row?.message_id).toBeNull();
            expect(row?.sent_at).toBeNull();
        });

        it('answers done for a delivery that was already sent', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);
            await deliveryLog.markSent({ notificationId, messageId: 77n, sentAt: at(1_000) });

            expect(await reserve(notificationId, at(RESERVATION_MS * 10))).toBe('done');
            expect((await rowOf(notificationId))?.status).toBe('sent');
        });

        it('answers done for a delivery that was skipped', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);
            await deliveryLog.markSkipped(notificationId);

            expect(await reserve(notificationId, at(RESERVATION_MS * 10))).toBe('done');
            expect((await rowOf(notificationId))?.status).toBe('skipped');
        });

        it('reports a fresh reservation of another call with the moment it expires', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            const result = await reserve(notificationId, at(30_000));

            expect(result).toEqual({ inProgressUntil: at(RESERVATION_MS) });
            expect((await rowOf(notificationId))?.reserved_at).toEqual(T0);
        });

        it('keeps the reservation fresh exactly at the reservation boundary', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            expect(await reserve(notificationId, at(RESERVATION_MS))).toEqual({
                inProgressUntil: at(RESERVATION_MS),
            });
        });

        it('takes over a stale reservation and moves reserved_at to now', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            expect(await reserve(notificationId, at(RESERVATION_MS + 1))).toBe('reserved');
            expect((await rowOf(notificationId))?.reserved_at).toEqual(at(RESERVATION_MS + 1));
        });

        it('lets only one of two concurrent first reservations win', async () => {
            const notificationId = await addNotification();

            const results = await Promise.all([
                reserve(notificationId, T0),
                reserve(notificationId, T0),
            ]);

            expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
            expect(results).toContainEqual({ inProgressUntil: at(RESERVATION_MS) });
        });

        it('lets only one of two concurrent takeovers of a stale reservation win', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);
            const takeoverAt = at(RESERVATION_MS * 2);

            const results = await Promise.all([
                reserve(notificationId, takeoverAt),
                reserve(notificationId, takeoverAt),
            ]);

            expect(results.filter((result) => result === 'reserved')).toHaveLength(1);
            expect(results).toContainEqual({ inProgressUntil: at(RESERVATION_MS * 3) });
        });
    });

    describe('markSent', () => {
        it('records the message id and sent time', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            await deliveryLog.markSent({
                notificationId,
                messageId: LARGE_MESSAGE_ID,
                sentAt: at(2_000),
            });

            const row = await rowOf(notificationId);
            expect(row?.status).toBe('sent');
            expect(row?.message_id).toBe(LARGE_MESSAGE_ID.toString());
            expect(row?.sent_at).toEqual(at(2_000));
        });
    });

    describe('markSkipped', () => {
        it('marks the reserved delivery as skipped without a message', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            await deliveryLog.markSkipped(notificationId);

            const row = await rowOf(notificationId);
            expect(row?.status).toBe('skipped');
            expect(row?.message_id).toBeNull();
        });
    });

    describe('release', () => {
        it('removes the reservation so the next call reserves again', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);

            await deliveryLog.release(notificationId);

            expect(await rowOf(notificationId)).toBeNull();
            expect(await reserve(notificationId, at(1_000))).toBe('reserved');
        });

        it('does not remove a delivery that was already sent', async () => {
            const notificationId = await addNotification();
            await reserve(notificationId, T0);
            await deliveryLog.markSent({ notificationId, messageId: 5n, sentAt: at(1_000) });

            await deliveryLog.release(notificationId);

            expect((await rowOf(notificationId))?.status).toBe('sent');
        });
    });
});
