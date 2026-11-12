import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateBefore } from './testing/migrate-before';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

interface TranscriptRowInput {
    fileId?: string;
    status?: string;
    failureReason?: string | null;
    attempts?: number;
    segments?: string;
}

describe.skipIf(adminUrl === undefined)('021_meeting_transcripts migration', () => {
    const dbName = `transcripts_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;

    const query = async (sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> =>
        (await client.query<Record<string, unknown>>(sql, params)).rows;

    const insertFile = async (): Promise<string> => {
        const rows = await query(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, held_until,
                  uploaded_at)
             VALUES ($1, 'a.mp3', 'audio/mpeg', 'recording', 10, $2, now(), now())
             RETURNING id`,
            [ownerId, `key-${randomUUID()}`],
        );
        return String(rows[0]?.id);
    };

    const insertTranscript = async (input: TranscriptRowInput = {}): Promise<string> => {
        const fileId = input.fileId ?? (await insertFile());
        await query(
            `INSERT INTO meeting_transcript
                 (file_id, owner_id, status, failure_reason, attempts, segments)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
            [
                fileId,
                ownerId,
                input.status ?? 'pending',
                input.failureReason ?? null,
                input.attempts ?? 0,
                input.segments ?? '[]',
            ],
        );
        return fileId;
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        // Схема до 022: дальше таблица меняется, этот тест проверяет исходную миграцию.
        await migrateBefore(dbUrl, '022');
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

    it('creates meeting_transcript with defaults', async () => {
        const fileId = await insertFile();
        await query('INSERT INTO meeting_transcript (file_id, owner_id) VALUES ($1, $2)', [
            fileId,
            ownerId,
        ]);

        const [row] = await query(
            `SELECT status, failure_reason, attempts, speaker_count, segments, created_at,
                    updated_at, completed_at
             FROM meeting_transcript WHERE file_id = $1`,
            [fileId],
        );

        expect(row).toMatchObject({
            status: 'pending',
            failure_reason: null,
            attempts: 0,
            speaker_count: 0,
            segments: [],
            completed_at: null,
        });
        expect(row.created_at).toBeInstanceOf(Date);
        expect(row.updated_at).toBeInstanceOf(Date);
    });

    it('uses file_id as the primary key', async () => {
        const fileId = await insertTranscript();

        await expect(insertTranscript({ fileId })).rejects.toThrow(/meeting_transcript_pkey/);
    });

    it('references stored_file', async () => {
        await expect(insertTranscript({ fileId: randomUUID() })).rejects.toThrow(/foreign key/);
    });

    it('rejects an unknown status', async () => {
        await expect(insertTranscript({ status: 'done' })).rejects.toThrow(/check constraint/);
    });

    it('rejects an unknown failure reason', async () => {
        await expect(insertTranscript({ status: 'failed', failureReason: 'oops' })).rejects.toThrow(
            /check constraint/,
        );
    });

    it.each([
        ['failed without a reason', 'failed', null],
        ['a reason for a non-failed status', 'pending', 'timeout'],
    ])('rejects %s', async (_case, status, failureReason) => {
        await expect(insertTranscript({ status, failureReason })).rejects.toThrow(
            /meeting_transcript_failure_reason_matches_status/,
        );
    });

    it('accepts every failure reason with the failed status', async () => {
        for (const reason of [
            'provider-unavailable',
            'unsupported-media',
            'too-long',
            'timeout',
            'file-deleted',
        ]) {
            await expect(
                insertTranscript({ status: 'failed', failureReason: reason }),
            ).resolves.toBeTypeOf('string');
        }
    });

    it('rejects negative attempts', async () => {
        await expect(insertTranscript({ attempts: -1 })).rejects.toThrow(/check constraint/);
    });

    it('requires segments to be a JSON array', async () => {
        await expect(insertTranscript({ segments: '{}' })).rejects.toThrow(/check constraint/);
    });
});
