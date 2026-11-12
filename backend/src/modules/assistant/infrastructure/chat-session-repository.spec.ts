import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { PinoLogger } from 'nestjs-pino';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../../database/postgres/migrator';
import { TransactionRunner } from '../../../database/postgres/transaction-runner';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import type { AssistantAnswer } from '../domain/ports/agent-runner.port';
import { ChatSessionRepository } from './chat-session-repository';

// Интеграционный тест: нужна чистая PostgreSQL с pgvector.
// Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL. Без него тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

const answer = (text = 'ответ'): AssistantAnswer => ({
    answer: text,
    toolCalls: [{ name: 'search', args: { q: 'мва' } }],
    durationMs: 1500,
});

describe.skipIf(adminUrl === undefined)('ChatSessionRepository', () => {
    const dbName = `chat_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let repo: ChatSessionRepository;
    let ownerId: string;
    let mine: { ownerId: string; channel: 'app' };

    const createUser = async (): Promise<string> => {
        const { rows } = await client.query<{ id: string }>(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'h') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        return rows[0]?.id ?? '';
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
        pool = await createPool(dbUrl);
        const logger = { setContext: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
        repo = new ChatSessionRepository(new TransactionRunner(pool, logger));
        ownerId = await createUser();
        mine = { ownerId, channel: 'app' };
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    const createFile = async (
        name: string,
        options: { owner?: string; status?: 'active' | 'deleted'; kind?: string } = {},
    ): Promise<string> => {
        const deleted = options.status === 'deleted';
        const { rows } = await client.query<{ id: string }>(
            `INSERT INTO stored_file (owner_id, original_name, media_type, kind, size_bytes,
                 storage_key, status, expires_at, uploaded_at, deleted_at)
             VALUES ($1, $2, $3, $4, 2048, $5, $6, now() + interval '7 days', now(), $7)
             RETURNING id`,
            [
                options.owner ?? ownerId,
                name,
                options.kind === 'document' ? 'application/pdf' : 'audio/mp4',
                options.kind ?? 'recording',
                `key-${randomUUID()}`,
                deleted ? 'deleted' : 'active',
                deleted ? new Date() : null,
            ],
        );
        return rows[0]?.id ?? '';
    };

    beforeEach(async () => {
        await client.query('DELETE FROM chat_session');
        await client.query('DROP TRIGGER IF EXISTS fail_update ON chat_session');
    });

    it('create + findById round-trips a session', async () => {
        const created = await repo.create(
            ChatSession.create({ ...mine, title: ChatTitle.of('Цены на МВА') }),
        );
        const found = await repo.findById(created.id);
        expect(found?.id).toBe(created.id);
        expect(found?.title.value).toBe('Цены на МВА');
        expect(found?.titleIsCustom).toBe(true);
        expect(found?.createdAt).toBeInstanceOf(Date);
    });

    it('create without title stores the default non-custom title', async () => {
        const created = await repo.create(ChatSession.create(mine));
        const found = await repo.findById(created.id);
        expect(found?.title.isDefault()).toBe(true);
        expect(found?.titleIsCustom).toBe(false);
    });

    it('findById returns null for an unknown id', async () => {
        expect(await repo.findById(randomUUID())).toBeNull();
    });

    it('list sorts by lastActivityAt desc and is empty without sessions', async () => {
        expect(await repo.list(ownerId)).toEqual([]);
        const a = await repo.create(
            ChatSession.create({ ...mine, title: ChatTitle.of('A') }, new Date('2026-01-01')),
        );
        const b = await repo.create(
            ChatSession.create({ ...mine, title: ChatTitle.of('B') }, new Date('2026-01-02')),
        );
        expect((await repo.list(ownerId)).map((s) => s.id)).toEqual([b.id, a.id]);
        await repo.appendAgentAnswer(a.id, ownerId, answer());
        expect((await repo.list(ownerId)).map((s) => s.id)).toEqual([a.id, b.id]);
    });

    it('listMessages returns messages in chronological order', async () => {
        const s = await repo.create(ChatSession.create(mine));
        await repo.appendUserMessage(s.id, ownerId, 'q1');
        await repo.appendAgentAnswer(s.id, ownerId, answer('a1'));
        await repo.appendUserMessage(s.id, ownerId, 'q2');
        await repo.appendAgentAnswer(s.id, ownerId, answer('a2'));
        const messages = await repo.listMessages(s.id, ownerId);
        expect(messages.map((m) => `${m.role}:${m.text}`)).toEqual([
            'user:q1',
            'agent:a1',
            'user:q2',
            'agent:a2',
        ]);
        expect(messages[0]?.toolCalls).toBeNull();
        expect(messages[1]?.toolCalls).toEqual([{ name: 'search', args: { q: 'мва' } }]);
        expect(messages[1]?.durationMs).toBe(1500);
    });

    it('listMessages of an unknown session throws ChatSessionNotFoundError', async () => {
        await expect(repo.listMessages(randomUUID(), ownerId)).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
    });

    it('appendUserMessage stores the question; unknown session throws', async () => {
        const s = await repo.create(ChatSession.create(mine));
        const m = await repo.appendUserMessage(s.id, ownerId, 'вопрос');
        expect(m.role).toBe('user');
        expect(m.text).toBe('вопрос');
        await expect(repo.appendUserMessage(randomUUID(), ownerId, 'x')).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
    });

    it('appendAgentAnswer bumps lastActivityAt and applies the auto title', async () => {
        const s = await repo.create(ChatSession.create(mine, new Date('2026-01-01')));
        const m = await repo.appendAgentAnswer(
            s.id,
            ownerId,
            answer(),
            ChatTitle.of('Сколько стоит МВА?'),
        );
        expect(m.role).toBe('agent');
        const found = await repo.findById(s.id);
        expect(found?.title.value).toBe('Сколько стоит МВА?');
        expect(found?.titleIsCustom).toBe(false);
        expect(found?.lastActivityAt.getTime()).toBeGreaterThan(s.lastActivityAt.getTime());
    });

    it('appendAgentAnswer does not overwrite a custom title', async () => {
        const s = await repo.create(
            ChatSession.create({ ...mine, title: ChatTitle.of('Мой чат') }),
        );
        await repo.appendAgentAnswer(s.id, ownerId, answer(), ChatTitle.of('Авто'));
        expect((await repo.findById(s.id))?.title.value).toBe('Мой чат');
    });

    it('appendAgentAnswer is atomic: nothing is saved when the update fails', async () => {
        const s = await repo.create(ChatSession.create(mine));
        await client.query(`
            CREATE OR REPLACE FUNCTION fail_chat_update() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'boom'; END $$ LANGUAGE plpgsql`);
        await client.query(`CREATE TRIGGER fail_update BEFORE UPDATE ON chat_session
            FOR EACH ROW EXECUTE FUNCTION fail_chat_update()`);
        await expect(
            repo.appendAgentAnswer(s.id, ownerId, answer(), ChatTitle.of('Авто')),
        ).rejects.toThrow();
        await client.query('DROP TRIGGER fail_update ON chat_session');
        expect(await repo.listMessages(s.id, ownerId)).toEqual([]);
        expect((await repo.findById(s.id))?.title.isDefault()).toBe(true);
    });

    it('appendAgentAnswer on an unknown session throws', async () => {
        await expect(
            repo.appendAgentAnswer(randomUUID(), ownerId, answer()),
        ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });

    it('rename sets a custom title and does not touch lastActivityAt', async () => {
        const s = await repo.create(ChatSession.create(mine, new Date('2026-01-01')));
        const renamed = await repo.rename(s.id, ownerId, ChatTitle.of('Новое имя'));
        expect(renamed.title.value).toBe('Новое имя');
        expect(renamed.titleIsCustom).toBe(true);
        expect(renamed.lastActivityAt.getTime()).toBe(s.lastActivityAt.getTime());
        await expect(repo.rename(randomUUID(), ownerId, ChatTitle.of('x'))).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
    });

    it('delete removes the session with its messages; repeat delete throws', async () => {
        const s = await repo.create(ChatSession.create(mine));
        await repo.appendUserMessage(s.id, ownerId, 'q');
        await repo.delete(s.id, ownerId);
        expect(await repo.findById(s.id)).toBeNull();
        const rows = await client.query('SELECT 1 FROM chat_message WHERE session_id = $1', [s.id]);
        expect(rows.rowCount).toBe(0);
        await expect(repo.delete(s.id, ownerId)).rejects.toBeInstanceOf(ChatSessionNotFoundError);
    });

    describe('operations are scoped to the owner', () => {
        it('a stranger cannot read, write, rename or delete the chat', async () => {
            const s = await repo.create(ChatSession.create(mine));
            await repo.appendUserMessage(s.id, ownerId, 'секрет');
            const stranger = await createUser();

            await expect(repo.listMessages(s.id, stranger)).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );
            await expect(repo.appendUserMessage(s.id, stranger, 'x')).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );
            await expect(repo.appendAgentAnswer(s.id, stranger, answer())).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );
            await expect(repo.rename(s.id, stranger, ChatTitle.of('Чужое'))).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );
            await expect(repo.delete(s.id, stranger)).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );

            expect((await repo.listMessages(s.id, ownerId)).map((m) => m.text)).toEqual(['секрет']);
            expect((await repo.findById(s.id))?.title.isDefault()).toBe(true);
        });
    });

    it('create stores the owner and the channel', async () => {
        const created = await repo.create(ChatSession.create(mine));
        const found = await repo.findById(created.id);
        expect(found?.ownerId).toBe(ownerId);
        expect(found?.channel).toBe('app');
    });

    it('findOwned returns the session of its owner', async () => {
        const created = await repo.create(ChatSession.create(mine));
        expect((await repo.findOwned(created.id, ownerId))?.id).toBe(created.id);
    });

    it('findOwned returns null for a foreign and for an unknown session', async () => {
        const created = await repo.create(ChatSession.create(mine));
        const stranger = await createUser();
        expect(await repo.findOwned(created.id, stranger)).toBeNull();
        expect(await repo.findOwned(randomUUID(), ownerId)).toBeNull();
    });

    it('list returns only app sessions of the owner', async () => {
        const stranger = await createUser();
        const own = await repo.create(ChatSession.create(mine));
        await repo.create(ChatSession.create({ ownerId: stranger, channel: 'app' }));
        await repo.findOrCreateTelegram(ownerId);
        expect((await repo.list(ownerId)).map((s) => s.id)).toEqual([own.id]);
    });

    it('findOrCreateTelegram creates one telegram dialog and returns it on repeat', async () => {
        const first = await repo.findOrCreateTelegram(ownerId);
        const second = await repo.findOrCreateTelegram(ownerId);
        expect(first.channel).toBe('telegram');
        expect(first.ownerId).toBe(ownerId);
        expect(second.id).toBe(first.id);
        const rows = await client.query(
            `SELECT 1 FROM chat_session WHERE owner_id = $1 AND channel = 'telegram'`,
            [ownerId],
        );
        expect(rows.rowCount).toBe(1);
    });

    it('findOrCreateTelegram under concurrency still yields one dialog', async () => {
        const results = await Promise.all(
            Array.from({ length: 5 }, () => repo.findOrCreateTelegram(ownerId)),
        );
        expect(new Set(results.map((s) => s.id)).size).toBe(1);
    });

    it('findOrCreateTelegram keeps dialogs of different owners apart', async () => {
        const other = await createUser();
        const a = await repo.findOrCreateTelegram(ownerId);
        const b = await repo.findOrCreateTelegram(other);
        expect(a.id).not.toBe(b.id);
    });

    it('findTelegram returns null without a dialog and creates nothing', async () => {
        await repo.create(ChatSession.create(mine));
        expect(await repo.findTelegram(ownerId)).toBeNull();
        const rows = await client.query(
            `SELECT 1 FROM chat_session WHERE owner_id = $1 AND channel = 'telegram'`,
            [ownerId],
        );
        expect(rows.rowCount).toBe(0);
    });

    it('findTelegram returns the telegram dialog of the owner only', async () => {
        const other = await createUser();
        const dialog = await repo.findOrCreateTelegram(ownerId);
        await repo.findOrCreateTelegram(other);
        const found = await repo.findTelegram(ownerId);
        expect(found?.id).toBe(dialog.id);
        expect(found?.channel).toBe('telegram');
        expect(found?.ownerId).toBe(ownerId);
        expect(await repo.findTelegram(await createUser())).toBeNull();
    });

    describe('attachments and sources', () => {
        it('stores the attachments of a user message in the order they were sent', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const second = await createFile('b.m4a');
            const first = await createFile('a.m4a');
            const stored = await repo.appendUserMessage(s.id, ownerId, '', [second, first]);
            expect(stored.attachments.map((a) => a.fileId)).toEqual([second, first]);

            const [message] = await repo.listMessages(s.id, ownerId);
            expect(message.text).toBe('');
            expect(message.source).toBe('run');
            expect(message.attachments.map((a) => [a.fileId, a.position, a.name])).toEqual([
                [second, 0, 'b.m4a'],
                [first, 1, 'a.m4a'],
            ]);
            expect(message.attachments[0]).toMatchObject({
                mediaType: 'audio/mp4',
                kind: 'recording',
                sizeBytes: 2048,
                status: 'active',
            });
        });

        it('reads the current status of the file from stored_file', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const fileId = await createFile('a.docx', { kind: 'document' });
            await repo.appendAgentAnswer(s.id, ownerId, { ...answer(), attachments: [fileId] });
            await client.query(
                `UPDATE stored_file SET status = 'deleted', deleted_at = now() WHERE id = $1`,
                [fileId],
            );
            const [message] = await repo.listMessages(s.id, ownerId);
            expect(message.attachments).toHaveLength(1);
            expect(message.attachments[0]).toMatchObject({
                fileId,
                name: 'a.docx',
                kind: 'document',
                status: 'deleted',
            });
        });

        it('stores the attachments of an agent answer in the same transaction', async () => {
            const s = await repo.create(ChatSession.create(mine));
            await expect(
                repo.appendAgentAnswer(s.id, ownerId, {
                    ...answer(),
                    attachments: [randomUUID()],
                }),
            ).rejects.toThrow();
            expect(await repo.listMessages(s.id, ownerId)).toEqual([]);
        });

        it('a system message has the system source, no trace, its attachments and bumps the activity', async () => {
            const s = await repo.create(ChatSession.create(mine, new Date('2026-01-01')));
            const doc = await createFile('расшифровка.docx', { kind: 'document' });
            const posted = await repo.appendSystemMessage(s.id, ownerId, {
                text: 'Расшифровка готова',
                attachments: [doc],
                dedupKey: 'event-1',
            });
            expect(posted).not.toBeNull();
            const [message] = await repo.listMessages(s.id, ownerId);
            expect(message).toMatchObject({
                role: 'agent',
                source: 'system',
                text: 'Расшифровка готова',
                toolCalls: null,
                durationMs: null,
                dedupKey: 'event-1',
            });
            expect(message.attachments.map((a) => a.fileId)).toEqual([doc]);
            const found = await repo.findById(s.id);
            expect(found?.lastActivityAt.getTime()).toBeGreaterThan(s.lastActivityAt.getTime());
            expect(found?.title.isDefault()).toBe(true);
        });

        it('a repeated dedup key gives null and adds nothing', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const input = { text: 'Готово', attachments: [], dedupKey: 'event-2' };
            expect(await repo.appendSystemMessage(s.id, ownerId, input)).not.toBeNull();
            expect(await repo.appendSystemMessage(s.id, ownerId, input)).toBeNull();
            expect(await repo.listMessages(s.id, ownerId)).toHaveLength(1);
        });

        it('a system message into a missing or foreign chat throws not found', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const stranger = await createUser();
            const input = { text: 'x', attachments: [], dedupKey: randomUUID() };
            await expect(
                repo.appendSystemMessage(randomUUID(), ownerId, input),
            ).rejects.toBeInstanceOf(ChatSessionNotFoundError);
            await expect(repo.appendSystemMessage(s.id, stranger, input)).rejects.toBeInstanceOf(
                ChatSessionNotFoundError,
            );
        });

        it('deleting a chat removes the attachment links but not the files', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const fileId = await createFile('a.m4a');
            await repo.appendUserMessage(s.id, ownerId, '', [fileId]);
            await repo.delete(s.id, ownerId);
            const links = await client.query(
                'SELECT 1 FROM chat_message_attachment WHERE file_id = $1',
                [fileId],
            );
            expect(links.rowCount).toBe(0);
            const files = await client.query('SELECT 1 FROM stored_file WHERE id = $1', [fileId]);
            expect(files.rowCount).toBe(1);
        });
    });

    describe('system message lookups', () => {
        it('findFirstSessionWithFile returns the first existing chat of the owner with the file in a question', async () => {
            const fileId = await createFile('встреча.m4a');
            const first = await repo.create(ChatSession.create(mine));
            const second = await repo.create(ChatSession.create(mine));
            const answerOnly = await repo.create(ChatSession.create(mine));
            await repo.appendAgentAnswer(answerOnly.id, ownerId, {
                ...answer(),
                attachments: [fileId],
            });
            await repo.appendUserMessage(first.id, ownerId, '', [fileId]);
            await repo.appendUserMessage(second.id, ownerId, 'снова', [fileId]);

            expect(await repo.findFirstSessionWithFile(fileId, ownerId)).toBe(first.id);
            expect(await repo.findFirstSessionWithFile(fileId, await createUser())).toBeNull();

            await repo.delete(first.id, ownerId);
            expect(await repo.findFirstSessionWithFile(fileId, ownerId)).toBe(second.id);
            await repo.delete(second.id, ownerId);
            expect(await repo.findFirstSessionWithFile(fileId, ownerId)).toBeNull();
        });

        it('hasDedupKey tells whether a system message with the key exists', async () => {
            const s = await repo.create(ChatSession.create(mine));
            const key = `event-${randomUUID()}`;
            expect(await repo.hasDedupKey(key)).toBe(false);
            await repo.appendSystemMessage(s.id, ownerId, {
                text: 'Готово',
                attachments: [],
                dedupKey: key,
            });
            expect(await repo.hasDedupKey(key)).toBe(true);
        });
    });
});
