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

const LEGACY_SEGMENTS = [
    { speaker: 'Спикер 2', start: 0, end: 4.5, text: 'Начнём' },
    { speaker: 'Спикер 1', start: 4.5, end: 9, text: 'Да, давайте' },
    { speaker: 'Спикер 10', start: 9, end: 12.25, text: 'Я тоже здесь' },
    { speaker: 'Спикер 2', start: 12.25, end: 20, text: 'Первый вопрос' },
];

describe.skipIf(adminUrl === undefined)('022_meeting_transcript_segments migration', () => {
    const dbName = `segments_mig_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let ownerId: string;
    let migratedFileId: string;
    let emptyFileId: string;

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

    const insertLegacyTranscript = async (segments: unknown[]): Promise<string> => {
        const fileId = await insertFile();
        await query(
            `INSERT INTO meeting_transcript
                 (file_id, owner_id, status, speaker_count, segments, completed_at)
             VALUES ($1, $2, 'completed', 3, $3::jsonb, now())`,
            [fileId, ownerId, JSON.stringify(segments)],
        );
        return fileId;
    };

    const insertTranscript = async (): Promise<string> => {
        const fileId = await insertFile();
        await query(
            `INSERT INTO meeting_transcript (file_id, owner_id, status, speaker_count, completed_at)
             VALUES ($1, $2, 'completed', 2, now())`,
            [fileId, ownerId],
        );
        return fileId;
    };

    const insertSegment = async (
        fileId: string,
        seq: number,
        extra: { speaker?: number; start?: number; end?: number; text?: string } = {},
    ): Promise<void> => {
        await query(
            `INSERT INTO meeting_transcript_segment (file_id, seq, speaker, start_sec, end_sec, text)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                fileId,
                seq,
                extra.speaker ?? 1,
                extra.start ?? 0,
                extra.end ?? 1,
                extra.text ?? 'текст',
            ],
        );
    };

    const insertSpeaker = async (fileId: string, speaker: number, name: string): Promise<void> => {
        await query(
            `INSERT INTO meeting_transcript_speaker (file_id, speaker, name) VALUES ($1, $2, $3)`,
            [fileId, speaker, name],
        );
    };

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);

        await migrateBefore(dbUrl, '022');
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        const [user] = await query(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        ownerId = String(user.id);
        migratedFileId = await insertLegacyTranscript(LEGACY_SEGMENTS);
        emptyFileId = await insertLegacyTranscript([]);

        await migrate(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('moves legacy segments in order with seq and speaker numbers', async () => {
        const rows = await query(
            `SELECT seq, speaker, start_sec, end_sec, text
             FROM meeting_transcript_segment WHERE file_id = $1 ORDER BY seq`,
            [migratedFileId],
        );

        expect(rows).toEqual([
            { seq: 0, speaker: 2, start_sec: 0, end_sec: 4.5, text: 'Начнём' },
            { seq: 1, speaker: 1, start_sec: 4.5, end_sec: 9, text: 'Да, давайте' },
            { seq: 2, speaker: 10, start_sec: 9, end_sec: 12.25, text: 'Я тоже здесь' },
            { seq: 3, speaker: 2, start_sec: 12.25, end_sec: 20, text: 'Первый вопрос' },
        ]);
    });

    it('moves nothing for a transcript without segments', async () => {
        const rows = await query('SELECT 1 FROM meeting_transcript_segment WHERE file_id = $1', [
            emptyFileId,
        ]);

        expect(rows).toHaveLength(0);
    });

    it('drops the segments column', async () => {
        const rows = await query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = 'meeting_transcript' AND column_name = 'segments'`,
        );

        expect(rows).toHaveLength(0);
    });

    it('keeps the transcript itself', async () => {
        const [row] = await query(
            'SELECT status, speaker_count FROM meeting_transcript WHERE file_id = $1',
            [migratedFileId],
        );

        expect(row).toEqual({ status: 'completed', speaker_count: 3 });
    });

    it('leaves meeting_transcript_speaker empty', async () => {
        const rows = await query('SELECT 1 FROM meeting_transcript_speaker');

        expect(rows).toHaveLength(0);
    });

    it('uses (file_id, seq) as the segment primary key', async () => {
        const fileId = await insertTranscript();
        await insertSegment(fileId, 0);

        await expect(insertSegment(fileId, 0)).rejects.toThrow(/meeting_transcript_segment_pkey/);
    });

    it('references meeting_transcript from segments', async () => {
        await expect(insertSegment(randomUUID(), 0)).rejects.toThrow(/foreign key/);
    });

    it.each([
        ['a negative seq', -1, {}],
        ['a speaker below 1', 0, { speaker: 0 }],
        ['a negative start', 0, { start: -1 }],
        ['an end before the start', 0, { start: 5, end: 4 }],
        ['an empty text', 0, { text: '' }],
    ])('rejects a segment with %s', async (_case, seq, extra) => {
        const fileId = await insertTranscript();

        await expect(insertSegment(fileId, seq, extra)).rejects.toThrow(/check constraint/);
    });

    it('stores a speaker name with updated_at', async () => {
        const fileId = await insertTranscript();
        await insertSpeaker(fileId, 1, 'Анна');

        const [row] = await query(
            'SELECT name, updated_at FROM meeting_transcript_speaker WHERE file_id = $1',
            [fileId],
        );

        expect(row.name).toBe('Анна');
        expect(row.updated_at).toBeInstanceOf(Date);
    });

    it('uses (file_id, speaker) as the speaker primary key', async () => {
        const fileId = await insertTranscript();
        await insertSpeaker(fileId, 1, 'Анна');

        await expect(insertSpeaker(fileId, 1, 'Пётр')).rejects.toThrow(
            /meeting_transcript_speaker_pkey/,
        );
    });

    it('allows the same name for two speakers', async () => {
        const fileId = await insertTranscript();
        await insertSpeaker(fileId, 1, 'Анна');

        await expect(insertSpeaker(fileId, 2, 'Анна')).resolves.toBeUndefined();
    });

    it('references meeting_transcript from speaker names', async () => {
        await expect(insertSpeaker(randomUUID(), 1, 'Анна')).rejects.toThrow(/foreign key/);
    });

    it.each([
        ['a speaker below 1', 0, 'Анна'],
        ['an empty name', 1, ''],
        ['a name longer than 100 characters', 1, 'я'.repeat(101)],
    ])('rejects a speaker name with %s', async (_case, speaker, name) => {
        const fileId = await insertTranscript();

        await expect(insertSpeaker(fileId, speaker, name)).rejects.toThrow(/check constraint/);
    });
});
