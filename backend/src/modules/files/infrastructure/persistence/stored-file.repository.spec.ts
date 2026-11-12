import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { DomainEventRegistry } from '../../../../shared/outbox/application/domain-event-registry';
import { OutboxWakeUpPort } from '../../../../shared/outbox/application/outbox-wake-up.port';
import { OutboxDomainEventPublisher } from '../../../../shared/outbox/infrastructure/outbox-domain-event-publisher';
import { OutboxSettings } from '../../../../shared/outbox/infrastructure/outbox-settings';
import { OutboxStore } from '../../../../shared/outbox/infrastructure/outbox-store';
import { registerFileEvents } from '../../contracts/register-file-events';
import { FILE_UPLOADED_EVENT_TYPE } from '../../domain/events/file-uploaded.event';
import { FileName } from '../../domain/file-name';
import { MediaType } from '../../domain/media-type';
import { RetentionPolicy } from '../../domain/retention-policy';
import { StoredFile } from '../../domain/stored-file';
import { StoredFileRepository } from './stored-file.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const DAY = 86_400_000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (days: number): Date => new Date(T0.getTime() + days * DAY);
const UPLOAD_LISTENER = 'testing.file-uploaded-listener';

class SilentWakeUp extends OutboxWakeUpPort {
    wake(): void {
        return undefined;
    }
}

describe.skipIf(adminUrl === undefined)('StoredFileRepository', () => {
    const dbName = `files_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const policy = new RetentionPolicy({ documentDays: 30, recordingDays: 1, maxHoldDays: 7 });
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let publisher: OutboxDomainEventPublisher;
    let files: StoredFileRepository;
    let owner: string;

    function upload(
        kind: 'document' | 'recording',
        now: Date = T0,
        overrides: { storageKey?: string; name?: string } = {},
    ): StoredFile {
        const id = randomUUID();
        return StoredFile.upload(
            {
                id,
                ownerId: owner,
                name: FileName.of(overrides.name ?? 'Отчёт за квартал.pdf'),
                mediaType: MediaType.of(kind === 'document' ? 'application/pdf' : 'audio/mpeg'),
                sizeBytes: 3 * 1024 ** 3,
                storageKey: overrides.storageKey ?? `files/${id}`,
                now,
            },
            policy,
        );
    }

    async function countRows(table: 'stored_file' | 'outbox_events'): Promise<number> {
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
        registerFileEvents(registry);
        registry.subscribe(FILE_UPLOADED_EVENT_TYPE, {
            name: UPLOAD_LISTENER,
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
        files = new StoredFileRepository(transactions);
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
        await client.query('DELETE FROM stored_file');
        await client.query('DELETE FROM auth_users');
        const result = await client.query<{ id: string }>(
            `INSERT INTO auth_users (login, password_hash) VALUES ('owner', 'hash') RETURNING id`,
        );
        owner = result.rows[0]?.id ?? '';
    });

    describe('save and findById', () => {
        it('round-trips a document with its expiry', async () => {
            const file = upload('document');

            await files.save(file);
            const loaded = await files.findById(file.id);

            expect(loaded).not.toBeNull();
            if (loaded === null) return;
            expect(loaded.id).toBe(file.id);
            expect(loaded.ownerId).toBe(owner);
            expect(loaded.name.value).toBe('Отчёт за квартал.pdf');
            expect(loaded.mediaType.mime).toBe('application/pdf');
            expect(loaded.kind).toBe('document');
            expect(loaded.sizeBytes).toBe(3 * 1024 ** 3);
            expect(loaded.storageKey).toBe(file.storageKey);
            expect(loaded.status).toBe('active');
            expect(loaded.retention.equals(file.retention)).toBe(true);
            expect(loaded.retention.expiresAt).toEqual(at(30));
            expect(loaded.retention.heldUntil).toBeNull();
            expect(loaded.uploadedAt).toEqual(T0);
            expect(loaded.deletedAt).toBeNull();
            expect(loaded.createdAt).toEqual(T0);
            expect(loaded.pullDomainEvents()).toEqual([]);
        });

        it('round-trips a held recording', async () => {
            const file = upload('recording');

            await files.save(file);
            const loaded = await files.findById(file.id);

            expect(loaded?.kind).toBe('recording');
            expect(loaded?.retention.heldUntil).toEqual(at(7));
            expect(loaded?.retention.expiresAt).toBeNull();
            expect(loaded?.isAwaitingProcessing()).toBe(true);
        });

        it('saves changes of retention and status', async () => {
            const file = upload('recording');
            await files.save(file);

            file.releaseHold(at(2), policy);
            await files.save(file);
            const released = await files.findById(file.id);
            expect(released?.retention.expiresAt).toEqual(at(3));
            expect(released?.retention.heldUntil).toBeNull();

            file.markDeleted(at(4), 'owner');
            await files.save(file);
            const deleted = await files.findById(file.id);
            expect(deleted?.status).toBe('deleted');
            expect(deleted?.deletedAt).toEqual(at(4));
            expect(deleted?.storageKey).toBe(file.storageKey);
            expect(await countRows('stored_file')).toBe(1);
        });

        it('returns null for an unknown id', async () => {
            expect(await files.findById(randomUUID())).toBeNull();
        });
    });

    describe('findExpired', () => {
        it('selects due files and stale holds, skipping deleted and future ones', async () => {
            const now = at(31);
            const dueDocument = upload('document');
            const futureDocument = upload('document', at(5));
            const releasedRecording = upload('recording');
            releasedRecording.releaseHold(at(10), policy);
            const staleHold = upload('recording', at(23));
            const freshHold = upload('recording', at(25));
            const deletedDocument = upload('document');
            deletedDocument.markDeleted(at(2), 'owner');
            for (const file of [
                dueDocument,
                futureDocument,
                releasedRecording,
                staleHold,
                freshHold,
                deletedDocument,
            ]) {
                await files.save(file);
            }

            const expired = await files.findExpired(now, policy, 100, null);

            expect(expired.map((f) => f.id).sort()).toEqual(
                [dueDocument.id, releasedRecording.id, staleHold.id].sort(),
            );
            expect(expired.every((f) => f.isExpired(now, policy))).toBe(true);
        });

        it('includes a file whose expiry equals now', async () => {
            const file = upload('document');
            await files.save(file);

            expect((await files.findExpired(at(30), policy, 10, null)).map((f) => f.id)).toEqual([
                file.id,
            ]);
        });

        it('limits the batch size', async () => {
            for (let i = 0; i < 5; i += 1) await files.save(upload('document'));

            expect(await files.findExpired(at(40), policy, 3, null)).toHaveLength(3);
        });

        it('pages by (uploadedAt, id) after the cursor', async () => {
            const uploaded = [
                upload('document', at(0)),
                upload('document', at(0)),
                upload('document', at(1)),
                upload('document', at(2)),
            ];
            for (const file of uploaded) await files.save(file);
            const ordered = [...uploaded].sort(
                (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime() || (a.id < b.id ? -1 : 1),
            );

            const first = await files.findExpired(at(40), policy, 2, null);
            const last = first.at(-1);
            if (last === undefined) throw new Error('expected a first page');
            const second = await files.findExpired(at(40), policy, 2, {
                uploadedAt: last.uploadedAt,
                id: last.id,
            });

            expect([...first, ...second].map((f) => f.id)).toEqual(ordered.map((f) => f.id));
        });
    });

    describe('findByIdForUpdate', () => {
        it('returns null for an unknown id', async () => {
            expect(await transactions.run(() => files.findByIdForUpdate(randomUUID()))).toBeNull();
        });

        it('makes a concurrent read-modify-write wait and see the committed change', async () => {
            const file = upload('recording');
            await files.save(file);
            let releaseFirst: () => void = () => undefined;
            const firstHolds = new Promise<void>((resolve) => {
                releaseFirst = resolve;
            });
            let firstLocked: () => void = () => undefined;
            const locked = new Promise<void>((resolve) => {
                firstLocked = resolve;
            });

            const deleting = transactions.run(async () => {
                const current = await files.findByIdForUpdate(file.id);
                if (current === null) throw new Error('expected the file');
                firstLocked();
                await firstHolds;
                current.markDeleted(at(1), 'owner');
                await files.save(current);
            });
            await locked;
            let secondReadAt = 0;
            const releasing = transactions.run(async () => {
                const current = await files.findByIdForUpdate(file.id);
                secondReadAt = Date.now();
                if (current?.isAwaitingProcessing() !== true) return;
                current.releaseHold(at(1), policy);
                await files.save(current);
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
            const releasedFirstAt = Date.now();
            releaseFirst();
            await Promise.all([deleting, releasing]);

            expect(secondReadAt).toBeGreaterThanOrEqual(releasedFirstAt);
            const saved = await files.findById(file.id);
            expect(saved?.status).toBe('deleted');
            expect(saved?.retention.isHeld()).toBe(true);
        });
    });

    describe('file with its file.uploaded event', () => {
        it('commits the file and the outbox event together', async () => {
            const file = upload('recording');

            await transactions.run(async () => {
                await files.save(file);
                await publisher.publish(file.pullDomainEvents());
            });

            expect(await files.findById(file.id)).not.toBeNull();
            const events = await client.query<{
                event_type: string;
                aggregate_id: string;
                payload: unknown;
            }>('SELECT event_type, aggregate_id, payload FROM outbox_events');
            expect(events.rows).toEqual([
                {
                    event_type: FILE_UPLOADED_EVENT_TYPE,
                    aggregate_id: file.id,
                    payload: {
                        ownerId: owner,
                        kind: 'recording',
                        mediaType: 'audio/mpeg',
                        sizeBytes: 3 * 1024 ** 3,
                    },
                },
            ]);
            const deliveries = await client.query<{ subscriber: string }>(
                'SELECT subscriber FROM outbox_deliveries',
            );
            expect(deliveries.rows).toEqual([{ subscriber: UPLOAD_LISTENER }]);
        });

        it('rolls back the event when the file cannot be saved', async () => {
            const existing = upload('document', T0, { storageKey: 'files/taken' });
            await files.save(existing);
            const file = upload('document', T0, { storageKey: 'files/taken' });

            await expect(
                transactions.run(async () => {
                    await publisher.publish(file.pullDomainEvents());
                    await files.save(file);
                }),
            ).rejects.toThrow();

            expect(await countRows('stored_file')).toBe(1);
            expect(await countRows('outbox_events')).toBe(0);
        });

        it('rolls back the file when the event cannot be written', async () => {
            const file = upload('document');
            const events = file.pullDomainEvents();
            await client.query(
                `INSERT INTO outbox_events (id, event_type, aggregate_id, payload)
                 VALUES ($1, 'testing.taken', 'other', '{}')`,
                [events[0]?.id],
            );

            await expect(
                transactions.run(async () => {
                    await files.save(file);
                    await publisher.publish(events);
                }),
            ).rejects.toThrow();

            expect(await countRows('stored_file')).toBe(0);
            expect(await countRows('outbox_events')).toBe(1);
        });
    });
});
