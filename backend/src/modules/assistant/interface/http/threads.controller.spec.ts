import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CancelAgentRunUseCase } from '../../application/cancel-agent-run.use-case';
import { CreateChatSessionUseCase } from '../../application/create-chat-session.use-case';
import { DeleteChatSessionUseCase } from '../../application/delete-chat-session.use-case';
import { GetChatMessagesUseCase } from '../../application/get-chat-messages.use-case';
import { ListChatSessionsUseCase } from '../../application/list-chat-sessions.use-case';
import { RenameChatSessionUseCase } from '../../application/rename-chat-session.use-case';
import { ActiveRunRegistryPort } from '../../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../../domain/ports/chat-thread.port';
import { ActiveRunRegistry } from '../../infrastructure/active-run-registry';
import { ChatSession } from '../../domain/chat-session';
import {
    ANONYMOUS,
    OTHER_TEST_USER,
    TEST_USER,
    USER_HEADER,
    authenticateByHeader,
} from './testing/authenticate-by-header';
import { InMemoryChatSessionRepository } from './testing/in-memory-chat-session-repository';
import { ThreadsController } from './threads.controller';

class FakeThread extends ChatThreadPort {
    deleted: string[] = [];
    deleteThread(sessionId: string): Promise<void> {
        this.deleted.push(sessionId);
        return Promise.resolve();
    }
}

describe('Threads HTTP API', () => {
    let app: INestApplication;
    let base: string;
    const thread = new FakeThread();
    const repository = new InMemoryChatSessionRepository();
    let registry: ActiveRunRegistry;

    async function call(
        method: string,
        path: string,
        body?: unknown,
        user?: string,
    ): Promise<{ status: number; json: unknown }> {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                'content-type': 'application/json',
                ...(user === undefined ? {} : { [USER_HEADER]: user }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return { status: response.status, json: text ? (JSON.parse(text) as unknown) : null };
    }

    async function createThread(title?: string): Promise<{ id: string }> {
        return (await call('POST', '/threads', title === undefined ? {} : { title })).json as {
            id: string;
        };
    }

    beforeAll(async () => {
        registry = new ActiveRunRegistry();
        const moduleRef = await Test.createTestingModule({
            controllers: [ThreadsController],
            providers: [
                CreateChatSessionUseCase,
                ListChatSessionsUseCase,
                GetChatMessagesUseCase,
                RenameChatSessionUseCase,
                DeleteChatSessionUseCase,
                CancelAgentRunUseCase,
                { provide: ChatSessionRepositoryPort, useValue: repository },
                { provide: ChatThreadPort, useValue: thread },
                { provide: ActiveRunRegistryPort, useValue: registry },
            ],
        }).compile();
        app = moduleRef.createNestApplication();
        app.use(authenticateByHeader);
        await app.listen(0);
        base = (await app.getUrl()).replace('[::1]', 'localhost');
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        repository.sessions.clear();
        repository.messages.clear();
        thread.deleted = [];
    });

    it('POST /threads creates a chat with the default title', async () => {
        const { status, json } = await call('POST', '/threads', {});
        expect(status).toBe(201);
        expect(json).toMatchObject({ title: 'Новый чат', titleIsCustom: false, running: false });
        expect(typeof (json as { id: string }).id).toBe('string');
    });

    it('POST /threads accepts a title and works without a body', async () => {
        const titled = await call('POST', '/threads', { title: ' Цены ' });
        expect(titled.json).toMatchObject({ title: 'Цены', titleIsCustom: true });
        expect((await call('POST', '/threads')).status).toBe(201);
    });

    it('POST /threads rejects an invalid title with 400', async () => {
        expect((await call('POST', '/threads', { title: '   ' })).status).toBe(400);
        expect((await call('POST', '/threads', { title: 'я'.repeat(121) })).status).toBe(400);
        expect((await call('POST', '/threads', { title: 5 })).status).toBe(400);
    });

    it('GET /threads lists chats with the running flag', async () => {
        await createThread('Первый');
        const second = await createThread('Второй');
        registry.tryStart(second.id, 'run-1');
        const { status, json } = await call('GET', '/threads');
        expect(status).toBe(200);
        expect(json).toMatchObject([
            { title: 'Второй', running: true },
            { title: 'Первый', running: false },
        ]);
    });

    it('GET /threads/:id/messages returns AG-UI messages and the running flag', async () => {
        const created = await createThread();
        await repository.appendUserMessage(created.id, TEST_USER, 'Сколько стоит МВА?');
        await repository.appendAgentAnswer(created.id, TEST_USER, {
            answer: 'Ответ',
            toolCalls: [{ name: 'search_rows', args: { query: 'МВА' } }],
            durationMs: 5,
        });

        const { status, json } = await call('GET', `/threads/${created.id}/messages`);

        expect(status).toBe(200);
        expect(json).toMatchObject({
            running: false,
            messages: [
                { role: 'user', content: 'Сколько стоит МВА?' },
                {
                    role: 'assistant',
                    content: 'Ответ',
                    toolCalls: [{ type: 'function', function: { name: 'search_rows' } }],
                },
                { role: 'tool', content: '' },
            ],
        });
    });

    it('GET messages returns attachments with the file status and the source of every message', async () => {
        const created = await createThread();
        repository.files.set('rec-1', {
            name: 'встреча.m4a',
            mediaType: 'audio/mp4',
            kind: 'recording',
            sizeBytes: 1024,
            status: 'active',
        });
        repository.files.set('doc-1', {
            name: 'расшифровка.docx',
            mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            kind: 'document',
            sizeBytes: 2048,
            status: 'deleted',
        });
        await repository.appendUserMessage(created.id, TEST_USER, '', ['rec-1']);
        await repository.appendAgentAnswer(created.id, TEST_USER, {
            answer: 'Запустил расшифровку',
            toolCalls: [],
            durationMs: 5,
        });
        await repository.appendSystemMessage(created.id, TEST_USER, {
            text: 'Расшифровка готова',
            attachments: ['doc-1'],
            dedupKey: 'event-1',
        });

        const { status, json } = await call('GET', `/threads/${created.id}/messages`);

        expect(status).toBe(200);
        expect(json).toMatchObject({
            messages: [
                {
                    role: 'user',
                    content: '',
                    source: 'run',
                    attachments: [
                        {
                            id: 'rec-1',
                            name: 'встреча.m4a',
                            mediaType: 'audio/mp4',
                            kind: 'recording',
                            sizeBytes: 1024,
                            status: 'active',
                        },
                    ],
                },
                {
                    role: 'assistant',
                    content: 'Запустил расшифровку',
                    source: 'run',
                    attachments: [],
                },
                {
                    role: 'assistant',
                    content: 'Расшифровка готова',
                    source: 'system',
                    attachments: [{ id: 'doc-1', kind: 'document', status: 'deleted' }],
                },
            ],
        });
    });

    it('GET messages reports running while a run is active', async () => {
        const created = await createThread();
        registry.tryStart(created.id, 'run-1');
        const { json } = await call('GET', `/threads/${created.id}/messages`);
        expect(json).toMatchObject({ messages: [], running: true });
    });

    it('GET messages answers 404 for an unknown or malformed id', async () => {
        expect((await call('GET', `/threads/${randomUUID()}/messages`)).status).toBe(404);
        expect((await call('GET', '/threads/not-a-uuid/messages')).status).toBe(404);
    });

    it('PATCH /threads/:id renames the chat', async () => {
        const created = await createThread();
        const { status, json } = await call('PATCH', `/threads/${created.id}`, {
            title: 'Новое имя',
        });
        expect(status).toBe(200);
        expect(json).toMatchObject({ id: created.id, title: 'Новое имя', titleIsCustom: true });
    });

    it('PATCH validates the title (400) and the id (404)', async () => {
        const created = await createThread();
        expect((await call('PATCH', `/threads/${created.id}`, { title: '' })).status).toBe(400);
        expect((await call('PATCH', `/threads/${created.id}`, {})).status).toBe(400);
        expect((await call('PATCH', `/threads/${randomUUID()}`, { title: 'x' })).status).toBe(404);
        expect((await call('PATCH', '/threads/bad-id', { title: 'x' })).status).toBe(404);
    });

    it('DELETE /threads/:id answers 204, removes the chat and cancels its active run', async () => {
        const created = await createThread();
        const run = registry.tryStart(created.id, 'run-1');
        const { status } = await call('DELETE', `/threads/${created.id}`);
        expect(status).toBe(204);
        expect(run?.signal.aborted).toBe(true);
        expect(thread.deleted).toEqual([created.id]);
        expect((await call('GET', `/threads/${created.id}/messages`)).status).toBe(404);
        expect((await call('DELETE', `/threads/${created.id}`)).status).toBe(404);
        expect((await call('DELETE', '/threads/bad-id')).status).toBe(404);
    });

    it('POST /threads/:id/run/cancel answers 204 and aborts the active run', async () => {
        const created = await createThread();
        const run = registry.tryStart(created.id, 'run-1');
        const { status } = await call('POST', `/threads/${created.id}/run/cancel`);
        expect(status).toBe(204);
        expect(run?.signal.aborted).toBe(true);
        expect(run?.status).toBe('cancelled');
    });

    it('run/cancel is idempotent: a chat without a run is a no-op', async () => {
        const created = await createThread();
        expect((await call('POST', `/threads/${created.id}/run/cancel`)).status).toBe(204);
        expect((await call('POST', `/threads/${created.id}/run/cancel`)).status).toBe(204);
        expect((await call('POST', `/threads/${randomUUID()}/run/cancel`)).status).toBe(404);
    });

    it('does not serve the old chat-sessions routes', async () => {
        expect((await call('GET', '/chat-sessions')).status).toBe(404);
    });

    describe('ownership', () => {
        async function foreignThread(): Promise<string> {
            const created = (await call('POST', '/threads', { title: 'Чужой' }, OTHER_TEST_USER))
                .json as { id: string };
            return created.id;
        }

        it('answers 401 without an authenticated user', async () => {
            expect((await call('GET', '/threads', undefined, ANONYMOUS)).status).toBe(401);
            expect((await call('POST', '/threads', {}, ANONYMOUS)).status).toBe(401);
        });

        it('creates the chat for the token user', async () => {
            const created = await createThread();
            expect(repository.sessions.get(created.id)?.ownerId).toBe('user-1');
        });

        it('lists only the chats of the token user', async () => {
            await createThread('Мой');
            await foreignThread();
            const { json } = await call('GET', '/threads');
            expect(json).toMatchObject([{ title: 'Мой' }]);
            expect((json as unknown[]).length).toBe(1);
        });

        it('does not list or serve the Telegram dialog of the user', async () => {
            const telegram = await repository.create(
                ChatSession.create({ ownerId: 'user-1', channel: 'telegram' }),
            );
            expect((await call('GET', '/threads')).json).toEqual([]);
            expect((await call('GET', `/threads/${telegram.id}/messages`)).status).toBe(404);
        });

        it('answers 404 for a foreign chat on every route, without changes', async () => {
            const id = await foreignThread();
            const run = registry.tryStart(id, 'run-1');
            expect((await call('GET', `/threads/${id}/messages`)).status).toBe(404);
            expect((await call('PATCH', `/threads/${id}`, { title: 'Мой' })).status).toBe(404);
            expect((await call('DELETE', `/threads/${id}`)).status).toBe(404);
            expect((await call('POST', `/threads/${id}/run/cancel`)).status).toBe(404);
            expect(repository.sessions.get(id)?.title.value).toBe('Чужой');
            expect(thread.deleted).toEqual([]);
            expect(run?.status).toBe('running');
        });

        it('serves the same chat to the owner regardless of the application', async () => {
            const created = await createThread('Общий');
            const response = await fetch(`${base}/threads`, {
                headers: { 'x-client-app': 'employee-app' },
            });
            expect(await response.json()).toMatchObject([{ id: created.id }]);
        });
    });
});
