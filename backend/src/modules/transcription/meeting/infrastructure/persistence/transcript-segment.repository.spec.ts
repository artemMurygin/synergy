import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../../database/postgres/transaction-runner';
import { TranscriptSegment } from '../../domain/transcript-segment';
import { TranscriptSegmentRepository } from './transcript-segment.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const seg = (
    seq: number,
    speaker: number,
    startSec: number,
    endSec: number,
    text: string,
): TranscriptSegment => TranscriptSegment.of({ seq, speaker, startSec, endSec, text });

describe.skipIf(adminUrl === undefined)('TranscriptSegmentRepository', () => {
    const dbName = `transcript_segments_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let segments: TranscriptSegmentRepository;
    let owner: string;

    async function insertTranscript(): Promise<string> {
        const file = await client.query<{ id: string }>(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, held_until,
                  uploaded_at)
             VALUES ($1, 'a.mp3', 'audio/mpeg', 'recording', 10, $2, now(), now())
             RETURNING id`,
            [owner, `key-${randomUUID()}`],
        );
        const fileId = file.rows[0]?.id ?? '';
        await client.query(
            `INSERT INTO meeting_transcript (file_id, owner_id, status, speaker_count)
             VALUES ($1, $2, 'processing', 0)`,
            [fileId, owner],
        );
        return fileId;
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
        segments = new TranscriptSegmentRepository(transactions);
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
        await client.query('DELETE FROM meeting_transcript_segment');
        await client.query('DELETE FROM meeting_transcript');
        await client.query('DELETE FROM stored_file');
        await client.query('DELETE FROM auth_users');
        const result = await client.query<{ id: string }>(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        owner = result.rows[0]?.id ?? '';
    });

    describe('insertAll and readAll', () => {
        it('reads segments back ordered by seq', async () => {
            const fileId = await insertTranscript();
            const written = [
                seg(0, 1, 0, 4.25, 'Добрый день.'),
                seg(1, 2, 4.5, 9.75, 'Здравствуйте!'),
                seg(2, 1, 10, 12.5, 'Начнём.'),
            ];

            await segments.insertAll(fileId, [written[2], written[0], written[1]]);

            expect(await segments.readAll(fileId)).toEqual(written);
        });

        it('returns nothing for a transcript without segments', async () => {
            expect(await segments.readAll(await insertTranscript())).toEqual([]);
        });

        it('does nothing for an empty list', async () => {
            const fileId = await insertTranscript();

            await segments.insertAll(fileId, []);

            expect(await segments.readAll(fileId)).toEqual([]);
        });

        it('keeps segments of different transcripts apart', async () => {
            const a = await insertTranscript();
            const b = await insertTranscript();
            await segments.insertAll(a, [seg(0, 1, 0, 1, 'а')]);
            await segments.insertAll(b, [seg(0, 2, 0, 1, 'б')]);

            expect((await segments.readAll(a)).map((s) => s.text)).toEqual(['а']);
            expect((await segments.readAll(b)).map((s) => s.text)).toEqual(['б']);
        });

        it('writes inside the surrounding transaction and rolls back with it', async () => {
            const fileId = await insertTranscript();

            await expect(
                transactions.run(async () => {
                    await segments.insertAll(fileId, [seg(0, 1, 0, 1, 'а')]);
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            expect(await segments.readAll(fileId)).toEqual([]);
        });

        it('rejects writing the same seq twice', async () => {
            const fileId = await insertTranscript();
            await segments.insertAll(fileId, [seg(0, 1, 0, 1, 'а')]);

            await expect(segments.insertAll(fileId, [seg(0, 1, 0, 1, 'б')])).rejects.toThrow();
        });
    });

    describe('speakerStats', () => {
        it('sums the talk time of every speaker ordered by speaker number', async () => {
            const fileId = await insertTranscript();
            await segments.insertAll(fileId, [
                seg(0, 2, 0, 4, 'а'),
                seg(1, 1, 4, 5.5, 'б'),
                seg(2, 2, 6, 7, 'в'),
            ]);

            expect(await segments.speakerStats(fileId)).toEqual([
                { speaker: 1, talkSec: 1.5 },
                { speaker: 2, talkSec: 5 },
            ]);
        });

        it('is empty without segments', async () => {
            expect(await segments.speakerStats(await insertTranscript())).toEqual([]);
        });
    });

    describe('samples', () => {
        it('takes the longest phrase of each speaker from different thirds of the recording', async () => {
            const fileId = await insertTranscript();
            // Запись 0–90 с: трети 0–30, 30–60, 60–90.
            await segments.insertAll(fileId, [
                seg(0, 1, 0, 5, 'короткая в первой'),
                seg(1, 1, 5, 10, 'самая длинная реплика первой трети записи'),
                seg(2, 2, 10, 20, 'второй спикер в начале'),
                seg(3, 1, 20, 25, 'ещё одна очень длинная реплика в первой трети, длиннее всех'),
                seg(4, 1, 35, 40, 'середина записи, средняя реплика'),
                seg(5, 2, 40, 50, 'второй спикер в середине записи'),
                seg(6, 1, 65, 70, 'конец записи'),
                seg(7, 2, 80, 90, 'второй спикер в конце'),
            ]);

            const samples = await segments.samples(fileId, 3);

            expect(samples.filter((s) => s.speaker === 1).map((s) => s.seq)).toEqual([3, 4, 6]);
            expect(samples.filter((s) => s.speaker === 2).map((s) => s.seq)).toEqual([2, 5, 7]);
            expect(samples.map((s) => s.seq)).toEqual([...samples.map((s) => s.seq)].sort());
        });

        it('fills up from the same third when other thirds have no phrases of the speaker', async () => {
            const fileId = await insertTranscript();
            await segments.insertAll(fileId, [
                seg(0, 1, 0, 5, 'а'),
                seg(1, 1, 5, 10, 'длиннее'),
                seg(2, 1, 10, 15, 'самая длинная'),
                seg(3, 2, 80, 90, 'конец'),
            ]);

            const samples = await segments.samples(fileId, 2);

            expect(samples.filter((s) => s.speaker === 1).map((s) => s.seq)).toEqual([1, 2]);
            expect(samples.filter((s) => s.speaker === 2).map((s) => s.seq)).toEqual([3]);
        });

        it('is empty without segments', async () => {
            expect(await segments.samples(await insertTranscript(), 3)).toEqual([]);
        });
    });
});
