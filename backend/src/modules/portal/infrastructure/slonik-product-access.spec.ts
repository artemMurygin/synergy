import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

import { DepartmentNotFoundError } from '../domain/errors';
import { ProductAccess } from '../domain/product-access';
import { SlonikDepartmentLookup } from './slonik-department-lookup';
import { SlonikProductAccessRepository } from './slonik-product-access.repository';

describe.skipIf(adminUrl === undefined)(
    'SlonikProductAccessRepository / SlonikDepartmentLookup',
    () => {
        const dbName = `portal_access_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        let client: Client;
        let pool: DatabasePool;
        let transactions: TransactionRunner;
        let repo: SlonikProductAccessRepository;
        let lookup: SlonikDepartmentLookup;
        let productId: string;

        async function addDepartment(id: string, name: string): Promise<void> {
            await client.query('INSERT INTO auth_departments (id, name) VALUES ($1, $2)', [
                id,
                name,
            ]);
        }

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
            transactions = new TransactionRunner(
                pool,
                new PinoLogger({ pinoHttp: { level: 'silent' } }),
            );

            repo = new SlonikProductAccessRepository(transactions);
            lookup = new SlonikDepartmentLookup(transactions);
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
            await client.query('DELETE FROM portal_product_departments');
            await client.query('DELETE FROM portal_products');
            await client.query('DELETE FROM auth_user_profiles');
            await client.query('DELETE FROM auth_departments');
            productId = randomUUID();
            await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $3)', [
                productId,
                'prod',
                'Продукт',
            ]);
        });

        describe('lockProduct', () => {
            it('находит продукт; неизвестный и некорректный UUID дают null', async () => {
                expect(await repo.lockProduct(productId)).toEqual({
                    id: productId,
                    slug: 'prod',
                    name: 'Продукт',
                });
                expect(await repo.lockProduct(randomUUID())).toBeNull();
                expect(await repo.lockProduct('not-a-uuid')).toBeNull();
            });

            it('FOR UPDATE: параллельная блокировка ждёт коммита первой транзакции', async () => {
                const order: string[] = [];
                let release: () => void = () => undefined;
                const gate = new Promise<void>((resolve) => {
                    release = resolve;
                });
                const first = transactions.run(async () => {
                    await repo.lockProduct(productId);
                    order.push('first-locked');
                    await gate;
                    order.push('first-done');
                });
                await new Promise((resolve) => setTimeout(resolve, 100));
                const second = transactions.run(async () => {
                    await repo.lockProduct(productId);
                    order.push('second-locked');
                });
                await new Promise((resolve) => setTimeout(resolve, 200));
                expect(order).toEqual(['first-locked']);
                release();
                await Promise.all([first, second]);
                expect(order).toEqual(['first-locked', 'first-done', 'second-locked']);
            });
        });

        describe('replace / findProductWithDepartments', () => {
            it('заменяет набор целиком; отделы по lower(name), id', async () => {
                await addDepartment('d-b', 'бета');
                await addDepartment('d-a', 'Альфа');
                await addDepartment('d-c', 'Гамма');
                await repo.replace(ProductAccess.of(productId, ['d-b', 'd-a']));
                expect((await repo.findProductWithDepartments(productId))?.departments).toEqual([
                    { id: 'd-a', name: 'Альфа' },
                    { id: 'd-b', name: 'бета' },
                ]);
                await repo.replace(ProductAccess.of(productId, ['d-c', 'd-c']));
                expect((await repo.findProductWithDepartments(productId))?.departments).toEqual([
                    { id: 'd-c', name: 'Гамма' },
                ]);
            });

            it('пустой набор очищает пометки', async () => {
                await addDepartment('d-a', 'Альфа');
                await repo.replace(ProductAccess.of(productId, ['d-a']));
                await repo.replace(ProductAccess.of(productId, []));
                expect((await repo.findProductWithDepartments(productId))?.departments).toEqual([]);
            });

            it('несуществующий отдел (FK 23503) → DepartmentNotFoundError, набор не меняется', async () => {
                await addDepartment('d-a', 'Альфа');
                await repo.replace(ProductAccess.of(productId, ['d-a']));
                await expect(
                    transactions.run(() =>
                        repo.replace(ProductAccess.of(productId, ['d-a', 'ghost'])),
                    ),
                ).rejects.toBeInstanceOf(DepartmentNotFoundError);
                expect((await repo.findProductWithDepartments(productId))?.departments).toEqual([
                    { id: 'd-a', name: 'Альфа' },
                ]);
            });

            it('findProductWithDepartments: нет продукта или некорректный UUID — null', async () => {
                expect(await repo.findProductWithDepartments(randomUUID())).toBeNull();
                expect(await repo.findProductWithDepartments('not-a-uuid')).toBeNull();
            });

            it('удаление отдела каскадом убирает пометку', async () => {
                await addDepartment('d-a', 'Альфа');
                await repo.replace(ProductAccess.of(productId, ['d-a']));
                await client.query("DELETE FROM auth_departments WHERE id = 'd-a'");
                expect((await repo.findProductWithDepartments(productId))?.departments).toEqual([]);
            });
        });

        describe('SlonikDepartmentLookup.findExistingIds', () => {
            it('возвращает только существующие id; пустой ввод — []', async () => {
                await addDepartment('d-a', 'Альфа');
                await addDepartment('d-b', 'Бета');
                expect((await lookup.findExistingIds(['d-a', 'ghost', 'd-b'])).sort()).toEqual([
                    'd-a',
                    'd-b',
                ]);
                expect(await lookup.findExistingIds([])).toEqual([]);
                expect(await lookup.findExistingIds(['ghost'])).toEqual([]);
            });
        });
    },
);
