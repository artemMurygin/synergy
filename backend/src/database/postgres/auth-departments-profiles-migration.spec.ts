import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)(
    '032_auth_departments and 033_auth_user_profiles migrations',
    () => {
        const dbName = `auth_dept_prof_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        let client: Client;

        const query = async (
            sql: string,
            params: unknown[] = [],
        ): Promise<Record<string, unknown>[]> =>
            (await client.query<Record<string, unknown>>(sql, params)).rows;

        const createUser = async (): Promise<string> => {
            const rows = await query(
                `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'hash') RETURNING id`,
                [`u-${randomUUID()}`],
            );
            return String(rows[0]?.id);
        };

        const createDepartment = async (name = `Отдел ${randomUUID()}`): Promise<string> => {
            const id = randomUUID();
            await query(`INSERT INTO auth_departments (id, name) VALUES ($1, $2)`, [id, name]);
            return id;
        };

        const createProfile = async (
            userId: string,
            fields: Record<string, unknown> = {},
        ): Promise<void> => {
            const row = { last_name: 'Иванов', first_name: 'Иван', ...fields };
            const columns = ['user_id', ...Object.keys(row)];
            const values = [userId, ...Object.values(row)];
            const placeholders = values.map((_, i) => `$${String(i + 1)}`).join(', ');
            await query(
                `INSERT INTO auth_user_profiles (${columns.join(', ')}) VALUES (${placeholders})`,
                values,
            );
        };

        beforeAll(async () => {
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`CREATE DATABASE ${dbName}`);
            await admin.end();
            const dbUrl = withDatabase(adminUrl ?? '', dbName);
            await migrate(dbUrl);
            client = new Client({ connectionString: dbUrl });
            await client.connect();
        }, 60_000);

        afterAll(async () => {
            await client.end();
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
            await admin.end();
        });

        describe('auth_departments', () => {
            it('rejects a duplicate name regardless of case', async () => {
                await createDepartment('Продажи');
                await expect(createDepartment('ПРОДАЖИ')).rejects.toThrow(/unique|duplicate/);
            });

            it('rejects a name longer than 200 characters and accepts exactly 200', async () => {
                await createDepartment('а'.repeat(200));
                await expect(createDepartment('б'.repeat(201))).rejects.toThrow(/check constraint/);
            });

            it('allows a department without a head', async () => {
                const id = await createDepartment();
                const rows = await query(
                    'SELECT head_user_id FROM auth_departments WHERE id = $1',
                    [id],
                );
                expect(rows).toEqual([{ head_user_id: null }]);
            });

            it('rejects a head that is not an existing user', async () => {
                await expect(
                    query(
                        `INSERT INTO auth_departments (id, name, head_user_id) VALUES ($1, $2, $3)`,
                        [randomUUID(), `Отдел ${randomUUID()}`, randomUUID()],
                    ),
                ).rejects.toThrow(/foreign key/);
            });

            it('clears head_user_id when the head user is deleted', async () => {
                const userId = await createUser();
                const id = randomUUID();
                await query(
                    `INSERT INTO auth_departments (id, name, head_user_id) VALUES ($1, $2, $3)`,
                    [id, `Отдел ${randomUUID()}`, userId],
                );
                await query('DELETE FROM auth_users WHERE id = $1', [userId]);
                const rows = await query(
                    'SELECT head_user_id FROM auth_departments WHERE id = $1',
                    [id],
                );
                expect(rows).toEqual([{ head_user_id: null }]);
            });

            it('accepts a non-UUID text id', async () => {
                await query(`INSERT INTO auth_departments (id, name) VALUES ('d1', 'Из файла')`);
                const rows = await query(`SELECT id FROM auth_departments WHERE id = 'd1'`);
                expect(rows).toEqual([{ id: 'd1' }]);
            });
        });

        describe('auth_user_profiles', () => {
            it('stores a full profile', async () => {
                const userId = await createUser();
                const departmentId = await createDepartment();
                await createProfile(userId, {
                    middle_name: 'Иванович',
                    department_id: departmentId,
                    position: 'Аналитик',
                    email: `full-${randomUUID()}@company.ru`,
                    scrm_employee_id: 'scrm-1',
                });
                const rows = await query(
                    'SELECT last_name, first_name, middle_name, position, scrm_employee_id FROM auth_user_profiles WHERE user_id = $1',
                    [userId],
                );
                expect(rows).toEqual([
                    {
                        last_name: 'Иванов',
                        first_name: 'Иван',
                        middle_name: 'Иванович',
                        position: 'Аналитик',
                        scrm_employee_id: 'scrm-1',
                    },
                ]);
            });

            it('allows a minimal profile with optional fields empty', async () => {
                const userId = await createUser();
                await createProfile(userId);
                const rows = await query(
                    'SELECT middle_name, department_id, position, email, scrm_employee_id FROM auth_user_profiles WHERE user_id = $1',
                    [userId],
                );
                expect(rows).toEqual([
                    {
                        middle_name: null,
                        department_id: null,
                        position: null,
                        email: null,
                        scrm_employee_id: null,
                    },
                ]);
            });

            it('allows a user without a profile to stay a working user', async () => {
                const userId = await createUser();
                const rows = await query(
                    `SELECT u.id, p.user_id AS profile_user_id
                       FROM auth_users u LEFT JOIN auth_user_profiles p ON p.user_id = u.id
                      WHERE u.id = $1`,
                    [userId],
                );
                expect(rows).toEqual([{ id: userId, profile_user_id: null }]);
            });

            it('allows only one profile per user', async () => {
                const userId = await createUser();
                await createProfile(userId);
                await expect(createProfile(userId)).rejects.toThrow(/unique|duplicate/);
            });

            it('deletes the profile together with the user', async () => {
                const userId = await createUser();
                await createProfile(userId);
                await query('DELETE FROM auth_users WHERE id = $1', [userId]);
                const rows = await query('SELECT 1 FROM auth_user_profiles WHERE user_id = $1', [
                    userId,
                ]);
                expect(rows).toEqual([]);
            });

            it('rejects a duplicate email regardless of case', async () => {
                const email = `dup-${randomUUID()}@company.ru`;
                await createProfile(await createUser(), { email });
                await expect(
                    createProfile(await createUser(), { email: email.toUpperCase() }),
                ).rejects.toThrow(/unique|duplicate/);
            });

            it('allows several profiles without an email', async () => {
                await createProfile(await createUser(), { email: null });
                await createProfile(await createUser(), { email: null });
                await createProfile(await createUser());
            });

            it.each([
                ['last_name', 200],
                ['first_name', 200],
                ['middle_name', 200],
                ['position', 200],
                ['scrm_employee_id', 64],
            ])('limits %s to %i characters', async (column, max) => {
                await createProfile(await createUser(), { [column]: 'x'.repeat(max) });
                await expect(
                    createProfile(await createUser(), { [column]: 'x'.repeat(max + 1) }),
                ).rejects.toThrow(/check constraint/);
            });

            it('limits email to 254 characters', async () => {
                const tail = '@company.ru';
                const ok = `${'a'.repeat(254 - tail.length)}${tail}`;
                await createProfile(await createUser(), { email: ok });
                await expect(
                    createProfile(await createUser(), { email: `a${ok}` }),
                ).rejects.toThrow(/check constraint/);
            });

            it('rejects a profile pointing to a missing department', async () => {
                await expect(
                    createProfile(await createUser(), { department_id: randomUUID() }),
                ).rejects.toThrow(/foreign key/);
            });

            it('rejects deleting a department that has profiles (RESTRICT)', async () => {
                const departmentId = await createDepartment();
                await createProfile(await createUser(), { department_id: departmentId });
                await expect(
                    query('DELETE FROM auth_departments WHERE id = $1', [departmentId]),
                ).rejects.toThrow(/foreign key/);
                const rows = await query('SELECT 1 FROM auth_departments WHERE id = $1', [
                    departmentId,
                ]);
                expect(rows).toHaveLength(1);
            });

            it('deletes an empty department', async () => {
                const departmentId = await createDepartment();
                await query('DELETE FROM auth_departments WHERE id = $1', [departmentId]);
                const rows = await query('SELECT 1 FROM auth_departments WHERE id = $1', [
                    departmentId,
                ]);
                expect(rows).toEqual([]);
            });

            it('has an index on department_id', async () => {
                const rows = await query(
                    `SELECT indexdef FROM pg_indexes
                      WHERE tablename = 'auth_user_profiles' AND indexdef LIKE '%(department_id)%'`,
                );
                expect(rows.length).toBeGreaterThan(0);
            });
        });
    },
);
