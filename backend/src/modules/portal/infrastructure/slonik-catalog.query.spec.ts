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

import { SlonikCatalogQuery } from './slonik-catalog.query';

describe.skipIf(adminUrl === undefined)('SlonikCatalogQuery.loadProductDepartments', () => {
    const dbName = `portal_catdep_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let query: SlonikCatalogQuery;

    async function addProduct(slug: string): Promise<string> {
        const id = randomUUID();
        await client.query('INSERT INTO portal_products (id, slug, name) VALUES ($1, $2, $3)', [
            id,
            slug,
            slug,
        ]);
        return id;
    }

    async function addDepartment(id: string, name: string): Promise<void> {
        await client.query('INSERT INTO auth_departments (id, name) VALUES ($1, $2)', [id, name]);
    }

    async function link(productId: string, departmentId: string): Promise<void> {
        await client.query(
            'INSERT INTO portal_product_departments (product_id, department_id) VALUES ($1, $2)',
            [productId, departmentId],
        );
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

        query = new SlonikCatalogQuery(transactions);
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
    });

    it('без пометок возвращает []', async () => {
        await addProduct('p1');
        expect(await query.loadProductDepartments()).toEqual([]);
    });

    it('все пары продукт-отдел с названием, порядок lower(name), id', async () => {
        const p1 = await addProduct('p1');
        const p2 = await addProduct('p2');
        await addDepartment('d-b', 'бета');
        await addDepartment('d-a', 'Альфа');
        await link(p1, 'd-b');
        await link(p1, 'd-a');
        await link(p2, 'd-b');
        expect(await query.loadProductDepartments()).toEqual([
            { productId: p1, id: 'd-a', name: 'Альфа' },
            { productId: p1, id: 'd-b', name: 'бета' },
            { productId: p2, id: 'd-b', name: 'бета' },
        ]);
    });

    it('удалённый отдел пропадает каскадом', async () => {
        const p1 = await addProduct('p1');
        await addDepartment('d-a', 'Альфа');
        await addDepartment('d-b', 'Бета');
        await link(p1, 'd-a');
        await link(p1, 'd-b');
        await client.query("DELETE FROM auth_departments WHERE id = 'd-a'");
        expect(await query.loadProductDepartments()).toEqual([
            { productId: p1, id: 'd-b', name: 'Бета' },
        ]);
    });
});
