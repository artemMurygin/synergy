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

describe.skipIf(adminUrl === undefined)('026_file_first_chat migration', () => {
    const dbName = `file_first_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;
    let firstSessionId: string;
    let secondSessionId: string;
    let sentFileId: string;
    let answerOnlyFileId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertSession = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO chat_session (owner_id, channel) VALUES ($1, 'app') RETURNING id`,
            [ownerId],
        );
        return String(rows[0]?.id);
    };

    const insertFile = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, expires_at,
                  uploaded_at)
             VALUES ($1, 'a.m4a', 'application/octet-stream', 'document', 10, $2, now(), now())
             RETURNING id`,
            [ownerId, `key-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const sendFile = async (sessionId: string, role: string, fileId: string): Promise<void> => {
        const [message] = await query(
            `INSERT INTO chat_message (session_id, role, text) VALUES ($1, $2, 'текст')
             RETURNING id`,
            [sessionId, role],
        );
        await query(
            `INSERT INTO chat_message_attachment (message_id, file_id, position)
             VALUES ($1, $2, 0)`,
            [message.id, fileId],
        );
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '026');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        ownerId = String(user.id);
        firstSessionId = await insertSession();
        secondSessionId = await insertSession();
        sentFileId = await insertFile();
        answerOnlyFileId = await insertFile();
        await sendFile(secondSessionId, 'agent', answerOnlyFileId);
        await sendFile(firstSessionId, 'user', sentFileId);
        await sendFile(secondSessionId, 'user', sentFileId);

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('remembers the first chat where the owner sent each file', async () => {
        const rows = await query(
            'SELECT file_id, owner_id, session_id FROM chat_file_first_session',
        );

        expect(rows).toEqual([
            { file_id: sentFileId, owner_id: ownerId, session_id: firstSessionId },
        ]);
    });

    it('keeps the row after the chat is deleted', async () => {
        await query('DELETE FROM chat_session WHERE id = $1', [firstSessionId]);

        const rows = await query(
            'SELECT session_id FROM chat_file_first_session WHERE file_id = $1',
            [sentFileId],
        );
        expect(rows).toEqual([{ session_id: firstSessionId }]);
    });
});
