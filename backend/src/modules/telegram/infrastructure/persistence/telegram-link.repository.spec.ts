import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { TelegramAccountTakenError } from '../../domain/errors';
import { TelegramIdentity } from '../../domain/telegram-identity';
import { TelegramLink } from '../../domain/telegram-link';
import { TelegramLinkRepository } from './telegram-link.repository';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-03-01T10:00:00.000Z');
const T1 = new Date('2026-03-01T11:30:00.000Z');
const LARGE_TELEGRAM_USER_ID = 9_007_199_254_740_993n;

class RollbackRequested extends Error {}

function identity(
    telegramUserId: bigint,
    chatId: bigint,
    username: string | null = null,
): TelegramIdentity {
    return TelegramIdentity.of({ telegramUserId, chatId, username });
}

describe.skipIf(adminUrl === undefined)('TelegramLinkRepository', () => {
    const databaseName = `telegram_links_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: TelegramLinkRepository;
    let anna: string;
    let boris: string;

    async function addUser(login: string): Promise<string> {
        const id = randomUUID();
        await client.query(
            'INSERT INTO auth_users (id, login, password_hash, is_active) VALUES ($1, $2, $3, true)',
            [id, login, '$argon2id$fake'],
        );
        return id;
    }

    async function countLinks(): Promise<number> {
        const result = await client.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM telegram_links',
        );
        return result.rows[0]?.count ?? 0;
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
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        repository = new TelegramLinkRepository(transactions);
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
        await client.query('DELETE FROM telegram_links');
        await client.query('DELETE FROM auth_users');
        anna = await addUser('anna');
        boris = await addUser('boris');
    });

    describe('save and find', () => {
        it('stores a new link and reads it back by user id with every field', async () => {
            const link = TelegramLink.link(anna, identity(1001n, 2001n, 'anna_tg'), T0);

            await repository.save(link);

            const stored = await repository.findByUserId(anna);
            expect(stored).not.toBeNull();
            if (stored === null) return;
            expect(stored.userId).toBe(anna);
            expect(stored.telegramUserId).toBe(1001n);
            expect(stored.chatId).toBe(2001n);
            expect(stored.username).toBe('anna_tg');
            expect(stored.notificationsEnabled).toBe(true);
            expect(stored.linkedAt).toEqual(T0);
            expect(stored.updatedAt).toEqual(T0);
        });

        it('reads a link by telegram user id', async () => {
            await repository.save(TelegramLink.link(anna, identity(1001n, 2001n), T0));

            const stored = await repository.findByTelegramUserId(1001n);

            expect(stored?.userId).toBe(anna);
            expect(stored?.username).toBeNull();
        });

        it('keeps telegram ids beyond the safe integer range exact', async () => {
            await repository.save(
                TelegramLink.link(
                    anna,
                    identity(LARGE_TELEGRAM_USER_ID, LARGE_TELEGRAM_USER_ID + 2n),
                    T0,
                ),
            );

            const stored = await repository.findByTelegramUserId(LARGE_TELEGRAM_USER_ID);

            expect(stored?.telegramUserId).toBe(LARGE_TELEGRAM_USER_ID);
            expect(stored?.chatId).toBe(LARGE_TELEGRAM_USER_ID + 2n);
        });

        it('returns null when there is no link', async () => {
            expect(await repository.findByUserId(anna)).toBeNull();
            expect(await repository.findByTelegramUserId(4242n)).toBeNull();
        });

        it('upserts by user id: relink and notification switch overwrite the stored row', async () => {
            const link = TelegramLink.link(anna, identity(1001n, 2001n, 'old_name'), T0);
            await repository.save(link);

            link.relink(identity(1001n, 3003n, 'new_name'), T1);
            link.disableNotifications(T1);
            await repository.save(link);

            expect(await countLinks()).toBe(1);
            const stored = await repository.findByUserId(anna);
            expect(stored?.chatId).toBe(3003n);
            expect(stored?.username).toBe('new_name');
            expect(stored?.notificationsEnabled).toBe(false);
            expect(stored?.linkedAt).toEqual(T0);
            expect(stored?.updatedAt).toEqual(T1);
        });

        it('turns a unique(telegram_user_id) violation into TelegramAccountTakenError', async () => {
            await repository.save(TelegramLink.link(anna, identity(1001n, 2001n), T0));

            const attempt = repository.save(TelegramLink.link(boris, identity(1001n, 2001n), T1));

            await expect(attempt).rejects.toBeInstanceOf(TelegramAccountTakenError);
            expect((await repository.findByTelegramUserId(1001n))?.userId).toBe(anna);
        });

        it('lets only one of two concurrent links of the same telegram account win', async () => {
            const results = await Promise.allSettled([
                transactions.run(() =>
                    repository.save(TelegramLink.link(anna, identity(1001n, 2001n), T0)),
                ),
                transactions.run(() =>
                    repository.save(TelegramLink.link(boris, identity(1001n, 2001n), T0)),
                ),
            ]);

            const rejected = results.filter((result) => result.status === 'rejected');
            expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect(
                rejected.every((result) => result.reason instanceof TelegramAccountTakenError),
            ).toBe(true);
            expect(await countLinks()).toBe(1);
        });
    });

    describe('deleteByUserId', () => {
        it('deletes the link and returns what was deleted', async () => {
            await repository.save(TelegramLink.link(anna, identity(1001n, 2001n, 'anna_tg'), T0));

            const deleted = await repository.deleteByUserId(anna);

            expect(deleted?.userId).toBe(anna);
            expect(deleted?.chatId).toBe(2001n);
            expect(deleted?.username).toBe('anna_tg');
            expect(await repository.findByUserId(anna)).toBeNull();
        });

        it('returns null when there was nothing to delete', async () => {
            expect(await repository.deleteByUserId(anna)).toBeNull();
        });
    });

    describe('transactions', () => {
        it('writes through the executor of the current transaction and rolls back with it', async () => {
            await repository.save(TelegramLink.link(boris, identity(5005n, 6006n), T0));

            const attempt = transactions.run(async () => {
                await repository.save(TelegramLink.link(anna, identity(1001n, 2001n), T0));
                await repository.deleteByUserId(boris);
                expect(await repository.findByUserId(anna)).not.toBeNull();
                throw new RollbackRequested('rollback');
            });

            await expect(attempt).rejects.toBeInstanceOf(RollbackRequested);
            expect(await repository.findByUserId(anna)).toBeNull();
            expect(await repository.findByUserId(boris)).not.toBeNull();
        });

        it('deletes the link together with its user', async () => {
            await repository.save(TelegramLink.link(anna, identity(1001n, 2001n), T0));

            await client.query('DELETE FROM auth_users WHERE id = $1', [anna]);

            expect(await countLinks()).toBe(0);
        });
    });
});
