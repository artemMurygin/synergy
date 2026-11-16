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

describe.skipIf(adminUrl === undefined)(
    '039_meeting_segment_unrecognized_speaker migration',
    () => {
        const dbName = `seg_unrec_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        let client: Client;
        let fileId: string;

        const insertSegment = (seq: number, speaker: number): Promise<unknown> =>
            client.query(
                `INSERT INTO meeting_transcript_segment (file_id, seq, speaker, start_sec, end_sec, text)
             VALUES ($1, $2, $3, 0, 1, 'текст')`,
                [fileId, seq, speaker],
            );

        beforeAll(async () => {
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`CREATE DATABASE ${dbName}`);
            await admin.end();
            const dbUrl = withDatabase(adminUrl ?? '', dbName);

            await migrateBefore(dbUrl, '039');
            client = new Client({ connectionString: dbUrl });
            await client.connect();
            const owner = await client.query<{ id: string }>(
                `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
            );
            const ownerId = owner.rows[0]?.id;
            const file = await client.query<{ id: string }>(
                `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, held_until,
                  uploaded_at)
             VALUES ($1, 'a.mp3', 'audio/mpeg', 'recording', 10, $2, now(), now())
             RETURNING id`,
                [ownerId, `key-${randomUUID()}`],
            );
            fileId = file.rows[0]?.id ?? '';
            await client.query(
                `INSERT INTO meeting_transcript (file_id, owner_id, status, speaker_count, completed_at)
             VALUES ($1, $2, 'completed', 1, now())`,
                [fileId, ownerId],
            );
            await insertSegment(0, 1);

            await migrate(dbUrl);
        }, 60_000);

        afterAll(async () => {
            await client.end();
            const admin = new Client({ connectionString: adminUrl });
            await admin.connect();
            await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
            await admin.end();
        });

        it('accepts an unrecognized speaker 0 and keeps existing segments', async () => {
            await insertSegment(1, 0);

            const rows = await client.query(
                'SELECT seq, speaker FROM meeting_transcript_segment WHERE file_id = $1 ORDER BY seq',
                [fileId],
            );
            expect(rows.rows).toEqual([
                { seq: 0, speaker: 1 },
                { seq: 1, speaker: 0 },
            ]);
        });

        it('still rejects a negative speaker', async () => {
            await expect(insertSegment(2, -1)).rejects.toThrow(
                /meeting_transcript_segment_speaker_check/,
            );
        });

        it('still rejects speaker 0 for a named speaker', async () => {
            await expect(
                client.query(
                    `INSERT INTO meeting_transcript_speaker (file_id, speaker, name) VALUES ($1, 0, 'Анна')`,
                    [fileId],
                ),
            ).rejects.toThrow(/check/);
        });
    },
);
