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

interface FileRowInput {
    kind?: string;
    status?: string;
    sizeBytes?: number;
    heldUntil?: Date | null;
    expiresAt?: Date | null;
    deletedAt?: Date | null;
    storageKey?: string;
}

describe.skipIf(adminUrl === undefined)('020_files migration', () => {
    const dbName = `files_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertFile = async (input: FileRowInput = {}): Promise<string> => {
        const rows = await query(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, status,
                  held_until, expires_at, uploaded_at, deleted_at)
             VALUES ($1, 'a.pdf', 'application/pdf', $2, $3, $4, $5, $6, $7, now(), $8)
             RETURNING id`,
            [
                ownerId,
                input.kind ?? 'document',
                input.sizeBytes ?? 10,
                input.storageKey ?? `key-${randomUUID()}`,
                input.status ?? 'active',
                input.heldUntil ?? null,
                input.expiresAt === undefined ? new Date() : input.expiresAt,
                input.deletedAt ?? null,
            ],
        );
        return String(rows[0]?.id);
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
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        ownerId = String(user.id);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('creates stored_file with defaults for id and timestamps', async () => {
        const id = await insertFile();
        const [row] = await query(
            'SELECT created_at, updated_at, deleted_at FROM stored_file WHERE id = $1',
            [id],
        );
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
        expect(row.deleted_at).toBeNull();
    });

    it('accepts the two kinds and rejects an unknown one', async () => {
        await expect(insertFile({ kind: 'document' })).resolves.toBeTypeOf('string');
        await expect(
            insertFile({ kind: 'recording', heldUntil: new Date(), expiresAt: null }),
        ).resolves.toBeTypeOf('string');
        await expect(insertFile({ kind: 'video' })).rejects.toThrow();
    });

    it('accepts the two statuses and rejects an unknown one', async () => {
        await expect(insertFile({ status: 'deleted', deletedAt: new Date() })).resolves.toBeTypeOf(
            'string',
        );
        await expect(insertFile({ status: 'archived' })).rejects.toThrow();
    });

    it('requires deleted_at exactly when the status is deleted', async () => {
        await expect(insertFile({ status: 'deleted' })).rejects.toThrow();
        await expect(insertFile({ status: 'active', deletedAt: new Date() })).rejects.toThrow();
    });

    it('requires exactly one of held_until and expires_at', async () => {
        await expect(insertFile({ heldUntil: null, expiresAt: null })).rejects.toThrow();
        await expect(
            insertFile({ heldUntil: new Date(), expiresAt: new Date() }),
        ).rejects.toThrow();
    });

    it('requires a positive size and a unique storage key', async () => {
        await expect(insertFile({ sizeBytes: 0 })).rejects.toThrow();
        await insertFile({ storageKey: 'dup' });
        await expect(insertFile({ storageKey: 'dup' })).rejects.toThrow();
    });

    it('stores sizes above 2 GiB', async () => {
        const id = await insertFile({ sizeBytes: 3 * 1024 ** 3 });
        const [row] = await query(
            'SELECT size_bytes::float8 AS size FROM stored_file WHERE id = $1',
            [id],
        );
        expect(row.size).toBe(3 * 1024 ** 3);
    });

    it('requires an existing owner', async () => {
        await expect(
            query(
                `INSERT INTO stored_file
                     (owner_id, original_name, media_type, kind, size_bytes, storage_key,
                      expires_at, uploaded_at)
                 VALUES ($1, 'a', 'text/plain', 'document', 1, 'k-owner', now(), now())`,
                [randomUUID()],
            ),
        ).rejects.toThrow();
    });

    it('has partial indexes for selecting expired active files', async () => {
        const defs = (
            await query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'stored_file'`)
        ).map((r) => String(r.indexdef));
        expect(defs.some((d) => d.includes('(expires_at)') && d.includes("'active'"))).toBe(true);
        expect(defs.some((d) => d.includes('(held_until)') && d.includes("'active'"))).toBe(true);
    });
});
