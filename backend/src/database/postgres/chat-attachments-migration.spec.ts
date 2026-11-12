import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrator';
import { migrateBefore } from './testing/migrate-before';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

interface MessageInput {
    role?: string;
    source?: string;
    dedupKey?: string | null;
}

describe.skipIf(adminUrl === undefined)('023_chat_attachments migration', () => {
    const dbName = `chat_att_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;
    let sessionId: string;
    let legacyMessageId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertSession = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO chat_session (owner_id, channel) VALUES ($1, 'app') RETURNING id`,
            [ownerId],
        );
        return String(rows[0]?.id);
    };

    const insertMessage = async (
        input: MessageInput = {},
        session = sessionId,
    ): Promise<string> => {
        const rows = await query(
            `INSERT INTO chat_message (session_id, role, text, source, dedup_key)
             VALUES ($1, $2, 'текст', COALESCE($3, 'run'), $4) RETURNING id`,
            [session, input.role ?? 'agent', input.source ?? null, input.dedupKey ?? null],
        );
        return String(rows[0]?.id);
    };

    const insertFile = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, expires_at,
                  uploaded_at)
             VALUES ($1, 'a.docx', 'application/octet-stream', 'document', 10, $2, now(), now())
             RETURNING id`,
            [ownerId, `key-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const attach = async (messageId: string, fileId: string, position: number): Promise<void> => {
        await query(
            `INSERT INTO chat_message_attachment (message_id, file_id, position)
             VALUES ($1, $2, $3)`,
            [messageId, fileId, position],
        );
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '023');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        ownerId = String(user.id);
        sessionId = await insertSession();
        const [legacy] = await query(
            `INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'user', 'вопрос')
             RETURNING id`,
            [sessionId],
        );
        legacyMessageId = String(legacy.id);

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('marks existing messages as run messages without a dedup key', async () => {
        const [row] = await query('SELECT source, dedup_key FROM chat_message WHERE id = $1', [
            legacyMessageId,
        ]);

        expect(row).toEqual({ source: 'run', dedup_key: null });
    });

    it('defaults source to run', async () => {
        const [row] = await query(
            `INSERT INTO chat_message (session_id, role, text) VALUES ($1, 'agent', 'ответ')
             RETURNING source`,
            [sessionId],
        );

        expect(row.source).toBe('run');
    });

    it('accepts a system message from the agent', async () => {
        await expect(
            insertMessage({ source: 'system', dedupKey: randomUUID() }),
        ).resolves.toBeTypeOf('string');
    });

    it('rejects an unknown source', async () => {
        await expect(insertMessage({ source: 'other' })).rejects.toThrow(/check constraint/);
    });

    it('rejects a system message from the user', async () => {
        await expect(insertMessage({ role: 'user', source: 'system' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it('keeps dedup_key unique', async () => {
        const dedupKey = randomUUID();
        await insertMessage({ source: 'system', dedupKey });

        await expect(insertMessage({ source: 'system', dedupKey })).rejects.toThrow(
            /duplicate key/,
        );
    });

    it('allows many messages without a dedup key', async () => {
        await insertMessage();

        await expect(insertMessage()).resolves.toBeTypeOf('string');
    });

    it('stores attachments of a message by position', async () => {
        const messageId = await insertMessage();
        const first = await insertFile();
        const second = await insertFile();
        await attach(messageId, second, 1);
        await attach(messageId, first, 0);

        const rows = await query(
            `SELECT file_id FROM chat_message_attachment WHERE message_id = $1 ORDER BY position`,
            [messageId],
        );

        expect(rows.map((r) => r.file_id)).toEqual([first, second]);
    });

    it('rejects the same file twice in one message', async () => {
        const messageId = await insertMessage();
        const fileId = await insertFile();
        await attach(messageId, fileId, 0);

        await expect(attach(messageId, fileId, 1)).rejects.toThrow(/duplicate key/);
    });

    it('rejects two attachments at the same position', async () => {
        const messageId = await insertMessage();
        await attach(messageId, await insertFile(), 0);

        await expect(attach(messageId, await insertFile(), 0)).rejects.toThrow(/duplicate key/);
    });

    it('rejects a negative position', async () => {
        const messageId = await insertMessage();

        await expect(attach(messageId, await insertFile(), -1)).rejects.toThrow(/check constraint/);
    });

    it('references stored_file', async () => {
        const messageId = await insertMessage();

        await expect(attach(messageId, randomUUID(), 0)).rejects.toThrow(/foreign key/);
    });

    it('references chat_message', async () => {
        await expect(attach('999999999', await insertFile(), 0)).rejects.toThrow(/foreign key/);
    });

    it('deletes attachments together with the message', async () => {
        const messageId = await insertMessage();
        await attach(messageId, await insertFile(), 0);

        await query('DELETE FROM chat_message WHERE id = $1', [messageId]);

        const rows = await query('SELECT 1 FROM chat_message_attachment WHERE message_id = $1', [
            messageId,
        ]);
        expect(rows).toHaveLength(0);
    });

    it('deletes attachments together with the chat', async () => {
        const otherSession = await insertSession();
        const messageId = await insertMessage({}, otherSession);
        await attach(messageId, await insertFile(), 0);

        await query('DELETE FROM chat_session WHERE id = $1', [otherSession]);

        const rows = await query('SELECT 1 FROM chat_message_attachment WHERE message_id = $1', [
            messageId,
        ]);
        expect(rows).toHaveLength(0);
    });

    it('indexes attachments by file to find the first chat of a file', async () => {
        const defs = (
            await query(
                `SELECT indexdef FROM pg_indexes WHERE tablename = 'chat_message_attachment'`,
            )
        ).map((r) => String(r.indexdef));

        expect(defs.some((d) => d.includes('(file_id, message_id)'))).toBe(true);
    });
});
