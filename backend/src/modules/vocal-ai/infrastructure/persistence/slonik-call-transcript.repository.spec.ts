import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { CallTranscript } from '../../domain/entities/call-transcript.entity';
import { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallTranscriptRepository } from './slonik-call-transcript.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function line(
    callId: number,
    lineIndex: number,
    text = `Строка ${String(lineIndex)}`,
): CallTranscriptLine {
    return new CallTranscriptLine({
        callId,
        lineIndex,
        speakerName: 'Иван',
        speakerRole: lineIndex % 2 === 0 ? 'manager' : 'client',
        startTimeSeconds: lineIndex,
        endTimeSeconds: lineIndex + 1,
        text,
    });
}

function transcript(callId: number, lines: CallTranscriptLine[]): CallTranscript {
    return CallTranscript.create({ callId: new CallId(callId), lines });
}

describe.skipIf(adminUrl === undefined)('CallTranscriptRepository', () => {
    const dbName = `call_transcript_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: CallTranscriptRepository;

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
        repository = new CallTranscriptRepository(transactions);
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
        await client.query('DELETE FROM vocal_ai_calls');
        await client.query(
            `INSERT INTO vocal_ai_calls (call_id, project_id) VALUES (100, 'project-1'), (101, 'project-1')`,
        );
    });

    describe('exists', () => {
        it('is false when no transcript lines are stored for the call', async () => {
            expect(await repository.exists(new CallId(100))).toBe(false);
        });

        it('is true once a transcript has been saved', async () => {
            await repository.save(transcript(100, [line(100, 0)]));

            expect(await repository.exists(new CallId(100))).toBe(true);
        });

        it('does not consider lines of a different call', async () => {
            await repository.save(transcript(101, [line(101, 0)]));

            expect(await repository.exists(new CallId(100))).toBe(false);
        });
    });

    describe('save and findByCallId', () => {
        it('returns null for a call without a saved transcript', async () => {
            expect(await repository.findByCallId(new CallId(100))).toBeNull();
        });

        it('persists lines in order and reads them back', async () => {
            await repository.save(
                transcript(100, [line(100, 0, 'Первая'), line(100, 1, 'Вторая')]),
            );

            const found = await repository.findByCallId(new CallId(100));

            expect(found?.lines.map((entry) => entry.text)).toEqual(['Первая', 'Вторая']);
        });

        it('idempotently replaces lines on repeated save without duplicates', async () => {
            await repository.save(transcript(100, [line(100, 0), line(100, 1)]));

            await repository.save(transcript(100, [line(100, 0, 'Новая первая')]));

            const found = await repository.findByCallId(new CallId(100));
            expect(found?.lines).toHaveLength(1);
            expect(found?.lines[0]?.text).toBe('Новая первая');
        });

        it('keeps transcripts of different calls apart', async () => {
            await repository.save(transcript(100, [line(100, 0, 'A')]));
            await repository.save(transcript(101, [line(101, 0, 'B')]));

            const a = await repository.findByCallId(new CallId(100));
            const b = await repository.findByCallId(new CallId(101));

            expect(a?.lines.map((entry) => entry.text)).toEqual(['A']);
            expect(b?.lines.map((entry) => entry.text)).toEqual(['B']);
        });
    });
});
