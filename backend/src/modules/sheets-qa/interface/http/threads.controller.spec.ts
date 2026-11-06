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
import { InMemoryActiveRunRegistry } from '../../infrastructure/in-memory-active-run-registry';
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
    let registry: InMemoryActiveRunRegistry;

    async function call(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<{ status: number; json: unknown }> {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
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
        registry = new InMemoryActiveRunRegistry();
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
        await repository.appendUserMessage(created.id, 'Сколько стоит МВА?');
        await repository.appendAgentAnswer(created.id, {
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
        expect((await call('POST', `/threads/${randomUUID()}/run/cancel`)).status).toBe(204);
    });

    it('does not serve the old chat-sessions routes', async () => {
        expect((await call('GET', '/chat-sessions')).status).toBe(404);
    });
});
