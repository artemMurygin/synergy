import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, sql, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BaseError } from '../../shared/errors';
import { AfterCommitOutsideTransactionError, TransactionRunner } from './transaction-runner';
import { TransactionRunnerPort } from './transaction-runner.port';

const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const countRow = z.object({ count: z.number() });
const backendRow = z.object({ pid: z.number() });

describe.skipIf(adminUrl === undefined)('TransactionRunner', () => {
    const dbName = `tx_runner_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let pool: DatabasePool;
    let observer: Client;
    let runner: TransactionRunner;

    async function countMarks(): Promise<number> {
        const row = await pool.one(sql.unsafe`SELECT count(*)::int AS count FROM marks`);
        return countRow.parse(row).count;
    }

    async function insertMark(label: string): Promise<void> {
        await runner.executor().query(sql.unsafe`INSERT INTO marks (label) VALUES (${label})`);
    }

    async function currentBackendPid(): Promise<number> {
        const row = await runner.executor().one(sql.unsafe`SELECT pg_backend_pid() AS pid`);
        return backendRow.parse(row).pid;
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        pool = await createPool(withDatabase(adminUrl ?? '', dbName));
        await pool.query(sql.unsafe`CREATE TABLE marks (label text NOT NULL)`);
        observer = new Client({ connectionString: withDatabase(adminUrl ?? '', dbName) });
        await observer.connect();
        runner = new TransactionRunner(pool, new PinoLogger({ pinoHttp: { level: 'silent' } }));
    }, 60_000);

    afterAll(async () => {
        await observer.end();
        await pool.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await pool.query(sql.unsafe`TRUNCATE marks`);
    });

    it('implements TransactionRunnerPort', () => {
        expect(runner).toBeInstanceOf(TransactionRunnerPort);
    });

    describe('run', () => {
        it('commits the work and returns its result', async () => {
            const result = await runner.run(async () => {
                await insertMark('committed');
                return 42;
            });

            expect(result).toBe(42);
            expect(await countMarks()).toBe(1);
        });

        it('rolls back the work when it throws', async () => {
            await expect(
                runner.run(async () => {
                    await insertMark('rolled-back');
                    throw new Error('boom');
                }),
            ).rejects.toThrow('boom');

            expect(await countMarks()).toBe(0);
        });

        it('reuses the open transaction for a nested run', async () => {
            await expect(
                runner.run(async () => {
                    const outerPid = await currentBackendPid();
                    const innerPid = await runner.run(async () => {
                        await insertMark('nested');
                        return currentBackendPid();
                    });
                    expect(innerPid).toBe(outerPid);
                    throw new Error('outer failed');
                }),
            ).rejects.toThrow('outer failed');

            expect(await countMarks()).toBe(0);
        });
    });

    describe('savepoint', () => {
        it('keeps the outer transaction usable after a failed nested work', async () => {
            await runner.run(async () => {
                await expect(
                    runner.savepoint(async () => {
                        await insertMark('rolled-back');
                        await runner.executor().query(sql.unsafe`SELECT 1/0`);
                    }),
                ).rejects.toThrow();
                await insertMark('kept');
            });

            expect(await countMarks()).toBe(1);
        });
    });

    describe('executor', () => {
        it('returns the pool outside a transaction', () => {
            expect(runner.executor()).toBe(pool);
        });

        it('returns the transaction connection inside a transaction', async () => {
            await runner.run(async () => {
                expect(runner.executor()).not.toBe(pool);
                await insertMark('inside');
                const { rows } = await observer.query('SELECT count(*)::int AS count FROM marks');
                expect(countRow.parse(rows[0]).count).toBe(0);
            });

            expect(await countMarks()).toBe(1);
        });
    });

    describe('afterCommit', () => {
        it('runs the callback only after a successful commit', async () => {
            const callback = vi.fn<() => void>();
            let wasCalledBeforeCommit = true;

            await runner.run(async () => {
                await insertMark('with-callback');
                runner.afterCommit(callback);
                await runner.run(() => {
                    runner.afterCommit(callback);
                    return Promise.resolve();
                });
                wasCalledBeforeCommit = callback.mock.calls.length > 0;
            });

            expect(wasCalledBeforeCommit).toBe(false);
            expect(callback).toHaveBeenCalledTimes(2);
        });

        it('sees committed data from the callback', async () => {
            let countSeenByCallback = -1;

            await runner.run(async () => {
                await insertMark('visible');
                runner.afterCommit(() => {
                    void countMarks().then((count) => {
                        countSeenByCallback = count;
                    });
                });
            });

            await vi.waitFor(() => {
                expect(countSeenByCallback).toBe(1);
            });
        });

        it('does not run the callback when the transaction rolls back', async () => {
            const callback = vi.fn<() => void>();

            await expect(
                runner.run(() => {
                    runner.afterCommit(callback);
                    return Promise.reject(new Error('boom'));
                }),
            ).rejects.toThrow('boom');

            expect(callback).not.toHaveBeenCalled();
        });

        it('keeps the committed result when a callback throws and runs the other callbacks', async () => {
            const secondCallback = vi.fn<() => void>();

            const result = await runner.run(async () => {
                await insertMark('kept');
                runner.afterCommit(() => {
                    throw new Error('callback failed');
                });
                runner.afterCommit(secondCallback);
                return 'done';
            });

            expect(result).toBe('done');
            expect(secondCallback).toHaveBeenCalledTimes(1);
            expect(await countMarks()).toBe(1);
        });

        it('does not leak callbacks into the next transaction', async () => {
            const callback = vi.fn<() => void>();

            await runner.run(() => {
                runner.afterCommit(callback);
                return Promise.resolve();
            });
            await runner.run(async () => {
                await insertMark('next');
            });

            expect(callback).toHaveBeenCalledTimes(1);
        });

        it('throws a coded error outside a transaction', () => {
            expect(() => {
                runner.afterCommit(() => undefined);
            }).toThrow(/outside a transaction/);
            const error = new AfterCommitOutsideTransactionError(
                'afterCommit was called outside a transaction',
            );
            expect(error).toBeInstanceOf(BaseError);
            expect(error.code).toBe('DATABASE.AFTER_COMMIT_OUTSIDE_TRANSACTION');
        });
    });

    describe('isInTransaction', () => {
        it('is false outside and true inside a transaction', async () => {
            expect(runner.isInTransaction()).toBe(false);

            await runner.run(async () => {
                expect(runner.isInTransaction()).toBe(true);
                await runner.run(() => {
                    expect(runner.isInTransaction()).toBe(true);
                    return Promise.resolve();
                });
            });

            expect(runner.isInTransaction()).toBe(false);
        });
    });
});
