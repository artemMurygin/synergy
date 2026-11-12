import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../../database/postgres/transaction-runner';
import { DomainEventRegistry } from '../../../../../shared/outbox/application/domain-event-registry';
import { OutboxWakeUpPort } from '../../../../../shared/outbox/application/outbox-wake-up.port';
import { OutboxDomainEventPublisher } from '../../../../../shared/outbox/infrastructure/outbox-domain-event-publisher';
import { OutboxSettings } from '../../../../../shared/outbox/infrastructure/outbox-settings';
import { OutboxStore } from '../../../../../shared/outbox/infrastructure/outbox-store';
import { registerMeetingTranscriptEvents } from '../../contracts/register-meeting-transcript-events';
import { DiarizedTranscript } from '../../domain/diarized-transcript';
import { MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE } from '../../domain/events/meeting-transcript-completed.event';
import { MEETING_TRANSCRIPT_FAILED_EVENT_TYPE } from '../../domain/events/meeting-transcript-failed.event';
import { MeetingTranscript } from '../../domain/meeting-transcript';
import { TranscriptSegment } from '../../domain/transcript-segment';
import { MeetingTranscriptRepository } from './meeting-transcript.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const T0 = new Date('2026-01-01T00:00:00.000Z');
const T1 = new Date('2026-01-01T00:05:00.000Z');
const COMPLETED_LISTENER = 'testing.meeting-transcript-completed-listener';
const FAILED_LISTENER = 'testing.meeting-transcript-failed-listener';

class SilentWakeUp extends OutboxWakeUpPort {
    wake(): void {
        return undefined;
    }
}

const SEGMENTS = [
    TranscriptSegment.of({ speaker: 'Спикер 1', start: 0, end: 4.25, text: 'Добрый день.' }),
    TranscriptSegment.of({ speaker: 'Спикер 2', start: 4.5, end: 9.75, text: 'Здравствуйте!' }),
    TranscriptSegment.of({ speaker: 'Спикер 1', start: 10, end: 12.5, text: 'Начнём.' }),
];

describe.skipIf(adminUrl === undefined)('MeetingTranscriptRepository', () => {
    const dbName = `transcripts_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let publisher: OutboxDomainEventPublisher;
    let transcripts: MeetingTranscriptRepository;
    let owner: string;

    async function insertFile(): Promise<string> {
        const result = await client.query<{ id: string }>(
            `INSERT INTO stored_file
                 (owner_id, original_name, media_type, kind, size_bytes, storage_key, held_until,
                  uploaded_at)
             VALUES ($1, 'a.mp3', 'audio/mpeg', 'recording', 10, $2, now(), now())
             RETURNING id`,
            [owner, `key-${randomUUID()}`],
        );
        return result.rows[0]?.id ?? '';
    }

    async function pending(): Promise<MeetingTranscript> {
        return MeetingTranscript.createPending({
            fileId: await insertFile(),
            ownerId: owner,
            now: T0,
        });
    }

    async function countRows(table: 'meeting_transcript' | 'outbox_events'): Promise<number> {
        const result = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count FROM ${table}`,
        );
        return result.rows[0]?.count ?? 0;
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
        const registry = new DomainEventRegistry();
        registerMeetingTranscriptEvents(registry);
        registry.subscribe(MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE, {
            name: COMPLETED_LISTENER,
            handle: () => Promise.resolve(),
        });
        registry.subscribe(MEETING_TRANSCRIPT_FAILED_EVENT_TYPE, {
            name: FAILED_LISTENER,
            handle: () => Promise.resolve(),
        });
        publisher = new OutboxDomainEventPublisher(
            transactions,
            registry,
            new OutboxStore(
                transactions,
                new OutboxSettings({
                    pollIntervalMs: 1000,
                    batchSize: 50,
                    maxAttempts: 10,
                    retentionDays: 7,
                }),
            ),
            new SilentWakeUp(),
        );
        transcripts = new MeetingTranscriptRepository(transactions);
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
        await client.query('DELETE FROM outbox_events');
        await client.query('DELETE FROM meeting_transcript');
        await client.query('DELETE FROM stored_file');
        await client.query('DELETE FROM auth_users');
        const result = await client.query<{ id: string }>(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        owner = result.rows[0]?.id ?? '';
    });

    describe('insertPendingIfAbsent', () => {
        it('inserts a pending transcript', async () => {
            const transcript = await pending();

            expect(await transcripts.insertPendingIfAbsent(transcript)).toBe(true);
            const loaded = await transcripts.findByFileId(transcript.fileId);

            expect(loaded?.status).toBe('pending');
            expect(loaded?.ownerId).toBe(owner);
            expect(loaded?.attempts).toBe(0);
            expect(loaded?.segments).toEqual([]);
            expect(loaded?.createdAt).toEqual(T0);
        });

        it('does not create a duplicate or overwrite on a repeat', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            await transcripts.save(transcript);

            const repeat = MeetingTranscript.createPending({
                fileId: transcript.fileId,
                ownerId: owner,
                now: T1,
            });

            expect(await transcripts.insertPendingIfAbsent(repeat)).toBe(false);
            expect(await countRows('meeting_transcript')).toBe(1);
            const loaded = await transcripts.findByFileId(transcript.fileId);
            expect(loaded?.status).toBe('processing');
            expect(loaded?.createdAt).toEqual(T0);
        });
    });

    describe('save and findByFileId', () => {
        it('restores segments from JSONB for a completed transcript', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 12.5, segments: SEGMENTS }),
                T1,
            );

            await transcripts.save(transcript);
            const loaded = await transcripts.findByFileId(transcript.fileId);

            expect(loaded).not.toBeNull();
            if (loaded === null) return;
            expect(loaded.status).toBe('completed');
            expect(loaded.segments).toEqual(SEGMENTS);
            expect(loaded.language).toBe('ru');
            expect(loaded.durationSec).toBe(12.5);
            expect(loaded.speakerCount).toBe(2);
            expect(loaded.attempts).toBe(1);
            expect(loaded.completedAt).toEqual(T1);
            expect(loaded.failureReason).toBeNull();
            expect(loaded.pullDomainEvents()).toEqual([]);
            const { rows } = await client.query<{ speaker_count: number }>(
                'SELECT speaker_count FROM meeting_transcript WHERE file_id = $1',
                [transcript.fileId],
            );
            expect(rows).toEqual([{ speaker_count: 2 }]);
        });

        it('saves a failed transcript with its reason', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.fail('too-long', T1);

            await transcripts.save(transcript);
            const loaded = await transcripts.findByFileId(transcript.fileId);

            expect(loaded?.status).toBe('failed');
            expect(loaded?.failureReason).toBe('too-long');
            expect(loaded?.segments).toEqual([]);
            expect(loaded?.completedAt).toEqual(T1);
        });

        it('saves a transcript failed because the recording was deleted', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.fail('file-deleted', T1);

            await transcripts.save(transcript);

            expect((await transcripts.findByFileId(transcript.fileId))?.failureReason).toBe(
                'file-deleted',
            );
        });

        it('saves a retried transcript back to pending', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.fail('timeout', T1);
            await transcripts.save(transcript);

            transcript.retry();
            await transcripts.save(transcript);
            const loaded = await transcripts.findByFileId(transcript.fileId);

            expect(loaded?.status).toBe('pending');
            expect(loaded?.failureReason).toBeNull();
            expect(loaded?.completedAt).toBeNull();
            expect(loaded?.attempts).toBe(1);
        });

        it('returns null for an unknown file', async () => {
            expect(await transcripts.findByFileId(randomUUID())).toBeNull();
        });
    });

    describe('findByFileIdForUpdate', () => {
        it('returns null for an unknown file', async () => {
            expect(
                await transactions.run(() => transcripts.findByFileIdForUpdate(randomUUID())),
            ).toBeNull();
        });

        it('makes a concurrent final transition wait and see the committed one', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            await transcripts.save(transcript);
            let releaseFirst: () => void = () => undefined;
            const firstHolds = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let firstLocked: () => void = () => undefined;
            const locked = new Promise<void>((resolve) => {
                firstLocked = resolve;
            });

            const failing = transactions.run(async () => {
                const current = await transcripts.findByFileIdForUpdate(transcript.fileId);
                if (current === null) throw new Error('expected the transcript');
                firstLocked();
                await firstHolds;
                current.fail('timeout', T1);
                await transcripts.save(current);
            });
            await locked;
            let secondReadAt = 0;
            let secondSawFinal = false;
            const completing = transactions.run(async () => {
                const current = await transcripts.findByFileIdForUpdate(transcript.fileId);
                secondReadAt = Date.now();
                if (current === null || current.isFinal()) {
                    secondSawFinal = true;
                    return;
                }
                current.complete(
                    DiarizedTranscript.of({
                        language: 'ru',
                        durationSec: 12.5,
                        segments: SEGMENTS,
                    }),
                    T1,
                );
                await transcripts.save(current);
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            const releasedFirstAt = Date.now();
            releaseFirst();
            await Promise.all([failing, completing]);

            expect(secondReadAt).toBeGreaterThanOrEqual(releasedFirstAt);
            expect(secondSawFinal).toBe(true);
            const saved = await transcripts.findByFileId(transcript.fileId);
            expect(saved?.status).toBe('failed');
            expect(saved?.failureReason).toBe('timeout');
        });
    });

    describe('transcript with its events', () => {
        it('commits the completed transcript and its event together', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.complete(
                DiarizedTranscript.of({ language: null, durationSec: 30, segments: [] }),
                T1,
            );

            await transactions.run(async () => {
                await transcripts.save(transcript);
                await publisher.publish(transcript.pullDomainEvents());
            });

            expect((await transcripts.findByFileId(transcript.fileId))?.status).toBe('no_speech');
            const events = await client.query<{
                event_type: string;
                aggregate_id: string;
                payload: unknown;
            }>('SELECT event_type, aggregate_id, payload FROM outbox_events');
            expect(events.rows).toEqual([
                {
                    event_type: MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
                    aggregate_id: transcript.fileId,
                    payload: { ownerId: owner, status: 'no_speech' },
                },
            ]);
            const deliveries = await client.query<{ subscriber: string }>(
                'SELECT subscriber FROM outbox_deliveries',
            );
            expect(deliveries.rows).toEqual([{ subscriber: COMPLETED_LISTENER }]);
        });

        it('commits the failed transcript and its event together', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.fail('unsupported-media', T1);

            await transactions.run(async () => {
                await transcripts.save(transcript);
                await publisher.publish(transcript.pullDomainEvents());
            });

            const events = await client.query<{ event_type: string; payload: unknown }>(
                'SELECT event_type, payload FROM outbox_events',
            );
            expect(events.rows).toEqual([
                {
                    event_type: MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
                    payload: { ownerId: owner, reason: 'unsupported-media' },
                },
            ]);
        });

        it('rolls back the transcript when the event cannot be written', async () => {
            const transcript = await pending();
            await transcripts.insertPendingIfAbsent(transcript);
            transcript.start();
            transcript.fail('timeout', T1);
            const events = transcript.pullDomainEvents();
            await client.query(
                `INSERT INTO outbox_events (id, event_type, aggregate_id, payload)
                 VALUES ($1, 'testing.taken', 'other', '{}')`,
                [events[0]?.id],
            );

            await expect(
                transactions.run(async () => {
                    await transcripts.save(transcript);
                    await publisher.publish(events);
                }),
            ).rejects.toThrow();

            expect((await transcripts.findByFileId(transcript.fileId))?.status).toBe('pending');
            expect(await countRows('outbox_events')).toBe(1);
        });
    });
});
