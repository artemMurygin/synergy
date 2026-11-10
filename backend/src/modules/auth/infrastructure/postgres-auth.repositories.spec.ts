import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { AuthSession } from '../domain/auth-session';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { UserSearch } from '../domain/user-search';
import { SlonikAuthSessionRepository } from './slonik-auth-session.repository';
import { SlonikTransactionRunner } from './slonik-transaction-runner';
import { SlonikUserRepository } from './slonik-user.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-01-01T00:00:00.000Z');
const HOUR = 3_600_000;
const GRACE = 10_000;

function newUser(login = 'ivanov'): User {
    return User.createWithTemporaryPassword({
        id: randomUUID(),
        login: Login.of(login),
        passwordHash: PasswordHash.of('$argon2id$fake'),
        now: T0,
    });
}

function newSession(userId: string, hash = 'hash-1'): AuthSession {
    return AuthSession.start({
        id: randomUUID(),
        userId,
        now: T0,
        firstToken: {
            id: randomUUID(),
            tokenHash: hash,
            expiresAt: new Date(T0.getTime() + 24 * HOUR),
        },
    });
}

describe.skipIf(adminUrl === undefined)('Slonik auth repositories', () => {
    const dbName = `auth_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let tx: SlonikTransactionRunner;
    let users: SlonikUserRepository;
    let sessions: SlonikAuthSessionRepository;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
        tx = new SlonikTransactionRunner(pool);
        users = new SlonikUserRepository(pool, tx);
        sessions = new SlonikAuthSessionRepository(pool, tx);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM auth_users');
    });

    describe('users', () => {
        it('save + findByLogin/findById round-trip', async () => {
            const user = newUser();
            await users.save(user);
            const byLogin = await users.findByLogin(Login.of('IVANOV'));
            expect(byLogin?.id).toBe(user.id);
            expect(byLogin?.login.value).toBe('ivanov');
            expect(byLogin?.passwordHash.value).toBe('$argon2id$fake');
            expect(byLogin?.mustChangePassword).toBe(true);
            expect(byLogin?.isActive).toBe(true);
            expect(byLogin?.createdAt.getTime()).toBe(T0.getTime());
            expect(byLogin?.passwordChangedAt.getTime()).toBe(T0.getTime());
            expect((await users.findById(user.id))?.login.value).toBe('ivanov');
        });

        it('returns null for unknown user', async () => {
            expect(await users.findByLogin(Login.of('nobody'))).toBeNull();
            expect(await users.findById(randomUUID())).toBeNull();
        });

        it('save updates an existing user', async () => {
            const user = newUser();
            await users.save(user);
            const later = new Date(T0.getTime() + HOUR);
            user.changePassword(PasswordHash.of('$argon2id$new'), later);
            user.deactivate();
            await users.save(user);
            const found = await users.findById(user.id);
            expect(found?.passwordHash.value).toBe('$argon2id$new');
            expect(found?.mustChangePassword).toBe(false);
            expect(found?.isActive).toBe(false);
            expect(found?.passwordChangedAt.getTime()).toBe(later.getTime());
        });

        it('existsByLogin is case-insensitive', async () => {
            await users.save(newUser());
            expect(await users.existsByLogin(Login.of('Ivanov'))).toBe(true);
            expect(await users.existsByLogin(Login.of('petrov'))).toBe(false);
        });
    });

    describe('searchActive', () => {
        const save = async (login: string, active = true): Promise<User> => {
            const user = newUser(login);
            if (!active) user.deactivate();
            await users.save(user);
            return user;
        };

        it('returns only active users sorted by login with the total', async () => {
            await save('yuri');
            const anna = await save('anna');
            await save('anton', false);
            const result = await users.searchActive(UserSearch.of(undefined), 10, 0);
            expect(result.total).toBe(2);
            expect(result.items).toEqual([
                { id: anna.id, login: 'anna' },
                { id: result.items[1]?.id, login: 'yuri' },
            ]);
            expect(Object.keys(result.items[0] ?? {}).sort()).toEqual(['id', 'login']);
        });

        it('searches case-insensitively by substring', async () => {
            await save('anna');
            await save('ivan');
            await save('Joanne');
            const result = await users.searchActive(UserSearch.of('AN'), 10, 0);
            expect(result.items.map((u) => u.login)).toEqual(['anna', 'ivan', 'joanne']);
            expect((await users.searchActive(UserSearch.of('zzz'), 10, 0)).total).toBe(0);
        });

        it('treats % and _ literally', async () => {
            await save('a_b');
            await save('axb');
            await save('50%off');
            expect((await users.searchActive(UserSearch.of('a_b'), 10, 0)).items).toHaveLength(1);
            expect((await users.searchActive(UserSearch.of('%'), 10, 0)).items).toHaveLength(1);
            expect((await users.searchActive(UserSearch.of('_'), 10, 0)).items).toHaveLength(1);
        });

        it('paginates and keeps the overall total', async () => {
            for (const login of ['a1', 'a2', 'a3']) await save(login);
            const page = await users.searchActive(UserSearch.of(undefined), 2, 2);
            expect(page.items.map((u) => u.login)).toEqual(['a3']);
            expect(page.total).toBe(3);
        });
    });

    describe('sessions', () => {
        it('persists a session and finds it by any token hash in the chain', async () => {
            const user = newUser();
            await users.save(user);
            const session = newSession(user.id);
            await sessions.save(session);

            const next = {
                id: randomUUID(),
                tokenHash: 'hash-2',
                expiresAt: new Date(T0.getTime() + 48 * HOUR),
            };
            const found = await tx.run(async () => {
                const s = await sessions.findByTokenHash('hash-1');
                expect(s).not.toBeNull();
                s?.rotate('hash-1', next, new Date(T0.getTime() + 1000), GRACE);
                if (s !== null) await sessions.save(s);
                return s;
            });
            expect(found?.tokens).toHaveLength(2);

            const byOld = await sessions.findByTokenHash('hash-1');
            const byNew = await sessions.findByTokenHash('hash-2');
            expect(byOld?.id).toBe(session.id);
            expect(byNew?.id).toBe(session.id);
            expect(byOld?.tokens).toHaveLength(2);
            const first = byOld?.tokens.find((t) => t.tokenHash === 'hash-1');
            expect(first?.usedAt?.getTime()).toBe(T0.getTime() + 1000);
            expect(first?.replacedById).toBe(next.id);
            expect(byOld?.activeToken()?.tokenHash).toBe('hash-2');
            expect(await sessions.findByTokenHash('missing')).toBeNull();
        });

        it('findById and revoked state round-trip', async () => {
            const user = newUser();
            await users.save(user);
            const session = newSession(user.id);
            await sessions.save(session);
            session.revoke(new Date(T0.getTime() + HOUR));
            await sessions.save(session);
            const found = await sessions.findById(session.id);
            expect(found?.isRevoked()).toBe(true);
            expect(found?.revokedAt?.getTime()).toBe(T0.getTime() + HOUR);
            expect(await sessions.findById(randomUUID())).toBeNull();
        });

        it('findByIdForUpdate blocks a concurrent locker until the transaction ends', async () => {
            const user = newUser();
            await users.save(user);
            const session = newSession(user.id);
            await sessions.save(session);
            const events: string[] = [];
            let release: () => void = () => undefined;
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            let locked: () => void = () => undefined;
            const lockedFirst = new Promise<void>((resolve) => {
                locked = resolve;
            });

            const first = tx.run(async () => {
                await sessions.findByIdForUpdate(session.id);
                locked();
                await held;
                events.push('first-commit');
            });
            await lockedFirst;
            const second = tx.run(async () => {
                await sessions.findByIdForUpdate(session.id);
                events.push('second-locked');
            });
            await new Promise((r) => setTimeout(r, 200));
            expect(events).toEqual([]);
            release();
            await Promise.all([first, second]);

            expect(events).toEqual(['first-commit', 'second-locked']);
        });

        it('revokeAllForUser revokes every session except the given one', async () => {
            const user = newUser();
            const other = newUser('petrov');
            await users.save(user);
            await users.save(other);
            const a = newSession(user.id, 'a');
            const b = newSession(user.id, 'b');
            const c = newSession(other.id, 'c');
            for (const s of [a, b, c]) await sessions.save(s);

            await sessions.revokeAllForUser(user.id, a.id);

            expect((await sessions.findById(a.id))?.isRevoked()).toBe(false);
            expect((await sessions.findById(b.id))?.isRevoked()).toBe(true);
            expect((await sessions.findById(c.id))?.isRevoked()).toBe(false);

            await sessions.revokeAllForUser(user.id);
            expect((await sessions.findById(a.id))?.isRevoked()).toBe(true);
            expect((await sessions.findById(c.id))?.isRevoked()).toBe(false);
        });

        it('parallel rotate: the row lock makes the second one a Race, not a double rotation', async () => {
            const user = newUser();
            await users.save(user);
            await sessions.save(newSession(user.id));

            const attempt = (hash: string): Promise<string> =>
                tx.run(async () => {
                    const s = await sessions.findByTokenHash('hash-1');
                    if (s === null) throw new Error('session missing');
                    await new Promise((r) => setTimeout(r, 150));
                    const result = s.rotate(
                        'hash-1',
                        {
                            id: randomUUID(),
                            tokenHash: hash,
                            expiresAt: new Date(T0.getTime() + HOUR),
                        },
                        new Date(T0.getTime() + 1000),
                        60_000,
                    );
                    if (result.kind === 'Rotated') await sessions.save(s);
                    return result.kind;
                });

            const [x, y] = await Promise.all([attempt('next-x'), attempt('next-y')]);
            expect([x, y].sort()).toEqual(['Race', 'Rotated']);

            const { rows } = await client.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM auth_refresh_tokens WHERE used_at IS NULL',
            );
            expect(rows[0]?.n).toBe(1);
        });
    });

    describe('transaction runner', () => {
        it('rolls back repository writes when the work throws', async () => {
            const user = newUser();
            await expect(
                tx.run(async () => {
                    await users.save(user);
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');
            expect(await users.findById(user.id)).toBeNull();
        });

        it('commits on success and returns the result', async () => {
            const user = newUser();
            const out = await tx.run(async () => {
                await users.save(user);
                return 42;
            });
            expect(out).toBe(42);
            expect(await users.findById(user.id)).not.toBeNull();
        });
    });
});
