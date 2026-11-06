import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AskQuestionUseCase } from '../../application/ask-question.use-case';
import { CreateChatSessionUseCase } from '../../application/create-chat-session.use-case';
import { DeleteChatSessionUseCase } from '../../application/delete-chat-session.use-case';
import { GetChatMessagesUseCase } from '../../application/get-chat-messages.use-case';
import { ListChatSessionsUseCase } from '../../application/list-chat-sessions.use-case';
import { RenameChatSessionUseCase } from '../../application/rename-chat-session.use-case';
import { ChatMessage } from '../../domain/chat-message';
import type { ChatSession } from '../../domain/chat-session';
import { ChatSessionNotFoundError } from '../../domain/chat-session-not-found.error';
import type { ChatTitle } from '../../domain/chat-title';
import { ChatSessionRepositoryPort } from '../../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../../domain/ports/chat-thread.port';
import { ActiveRunRegistryPort } from '../../domain/ports/active-run-registry.port';
import { InMemoryActiveRunRegistry } from '../../infrastructure/in-memory-active-run-registry';
import { SheetsAssistantPort } from '../../domain/ports/sheets-assistant.port';
import type { AssistantAnswer } from '../../domain/ports/sheets-assistant.port';
import { ChatSessionsController } from './chat-sessions.controller';
import { SheetsQaController } from './sheets-qa.controller';

class InMemoryRepository extends ChatSessionRepositoryPort {
    sessions = new Map<string, ChatSession>();
    messages = new Map<string, ChatMessage[]>();
    private nextId = 1;

    create(session: ChatSession): Promise<ChatSession> {
        this.sessions.set(session.id, session);
        this.messages.set(session.id, []);
        return Promise.resolve(session);
    }
    findById(id: string): Promise<ChatSession | null> {
        return Promise.resolve(this.sessions.get(id) ?? null);
    }
    list(): Promise<ChatSession[]> {
        return Promise.resolve([...this.sessions.values()].reverse());
    }
    listMessages(sessionId: string): Promise<ChatMessage[]> {
        return this.require(sessionId, () => this.messages.get(sessionId) ?? []);
    }
    appendUserMessage(sessionId: string, text: string): Promise<ChatMessage> {
        return this.require(sessionId, () => {
            const message = ChatMessage.user({
                id: this.nextId++,
                sessionId,
                text,
                createdAt: new Date(),
            });
            this.messages.get(sessionId)?.push(message);
            return message;
        });
    }
    appendAgentAnswer(
        sessionId: string,
        answer: AssistantAnswer,
        autoTitle?: ChatTitle,
    ): Promise<ChatMessage> {
        return this.require(sessionId, () => {
            const message = ChatMessage.agent({
                id: this.nextId++,
                sessionId,
                text: answer.answer,
                toolCalls: answer.toolCalls,
                durationMs: answer.durationMs,
                createdAt: new Date(),
            });
            this.messages.get(sessionId)?.push(message);
            const session = this.sessions.get(sessionId);
            if (session && autoTitle) this.sessions.set(sessionId, session.rename(autoTitle));
            return message;
        });
    }
    rename(sessionId: string, title: ChatTitle): Promise<ChatSession> {
        return this.require(sessionId, () => {
            const renamed = this.sessions.get(sessionId)?.rename(title);
            if (!renamed) throw new ChatSessionNotFoundError(sessionId);
            this.sessions.set(sessionId, renamed);
            return renamed;
        });
    }
    delete(sessionId: string): Promise<void> {
        return this.require(sessionId, () => {
            this.sessions.delete(sessionId);
            this.messages.delete(sessionId);
        });
    }
    private require<T>(sessionId: string, action: () => T): Promise<T> {
        if (!this.sessions.has(sessionId))
            return Promise.reject(new ChatSessionNotFoundError(sessionId));
        return Promise.resolve(action());
    }
}

class FakeAssistant extends SheetsAssistantPort {
    asked: string[] = [];
    ask(question: string): Promise<AssistantAnswer> {
        this.asked.push(question);
        return Promise.resolve({ answer: 'Ответ', toolCalls: [], durationMs: 5 });
    }
}

class FakeThread extends ChatThreadPort {
    deleted: string[] = [];
    deleteThread(sessionId: string): Promise<void> {
        this.deleted.push(sessionId);
        return Promise.resolve();
    }
}

describe('Chat sessions HTTP API', () => {
    let app: INestApplication;
    let base: string;
    const assistant = new FakeAssistant();
    const thread = new FakeThread();
    let repository: InMemoryRepository;

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

    beforeAll(async () => {
        repository = new InMemoryRepository();
        const moduleRef = await Test.createTestingModule({
            controllers: [ChatSessionsController, SheetsQaController],
            providers: [
                CreateChatSessionUseCase,
                ListChatSessionsUseCase,
                GetChatMessagesUseCase,
                RenameChatSessionUseCase,
                DeleteChatSessionUseCase,
                AskQuestionUseCase,
                { provide: ChatSessionRepositoryPort, useValue: repository },
                { provide: ChatThreadPort, useValue: thread },
                { provide: ActiveRunRegistryPort, useClass: InMemoryActiveRunRegistry },
                { provide: SheetsAssistantPort, useValue: assistant },
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
        assistant.asked = [];
        thread.deleted = [];
    });

    it('POST /chat-sessions creates a chat with the default title', async () => {
        const { status, json } = await call('POST', '/chat-sessions', {});
        expect(status).toBe(201);
        expect(json).toMatchObject({ title: 'Новый чат', titleIsCustom: false });
        expect(typeof (json as { id: string }).id).toBe('string');
    });

    it('POST /chat-sessions accepts a title and works without a body', async () => {
        const titled = await call('POST', '/chat-sessions', { title: ' Цены ' });
        expect(titled.json).toMatchObject({ title: 'Цены', titleIsCustom: true });
        const bare = await call('POST', '/chat-sessions');
        expect(bare.status).toBe(201);
    });

    it('POST /chat-sessions rejects an invalid title with 400', async () => {
        expect((await call('POST', '/chat-sessions', { title: '   ' })).status).toBe(400);
        expect((await call('POST', '/chat-sessions', { title: 'я'.repeat(121) })).status).toBe(400);
        expect((await call('POST', '/chat-sessions', { title: 5 })).status).toBe(400);
    });

    it('GET /chat-sessions lists chats', async () => {
        await call('POST', '/chat-sessions', { title: 'Первый' });
        await call('POST', '/chat-sessions', { title: 'Второй' });
        const { status, json } = await call('GET', '/chat-sessions');
        expect(status).toBe(200);
        expect((json as { title: string }[]).map((s) => s.title)).toEqual(['Второй', 'Первый']);
    });

    it('GET /chat-sessions/:id/messages returns the history after ask', async () => {
        const created = (await call('POST', '/chat-sessions', {})).json as { id: string };
        const ask = await call('POST', '/sheets-qa/ask', {
            question: 'Сколько стоит МВА?',
            sessionId: created.id,
        });
        expect(ask.status).toBe(201);
        const { status, json } = await call('GET', `/chat-sessions/${created.id}/messages`);
        expect(status).toBe(200);
        expect(json).toMatchObject([
            { role: 'user', text: 'Сколько стоит МВА?', toolCalls: null, durationMs: null },
            { role: 'agent', text: 'Ответ', toolCalls: [], durationMs: 5 },
        ]);
    });

    it('GET messages answers 404 for an unknown or malformed id', async () => {
        expect((await call('GET', `/chat-sessions/${randomUUID()}/messages`)).status).toBe(404);
        expect((await call('GET', '/chat-sessions/not-a-uuid/messages')).status).toBe(404);
    });

    it('PATCH /chat-sessions/:id renames the chat', async () => {
        const created = (await call('POST', '/chat-sessions', {})).json as { id: string };
        const { status, json } = await call('PATCH', `/chat-sessions/${created.id}`, {
            title: 'Новое имя',
        });
        expect(status).toBe(200);
        expect(json).toMatchObject({ id: created.id, title: 'Новое имя', titleIsCustom: true });
    });

    it('PATCH validates the title (400) and the id (404)', async () => {
        const created = (await call('POST', '/chat-sessions', {})).json as { id: string };
        expect((await call('PATCH', `/chat-sessions/${created.id}`, { title: '' })).status).toBe(
            400,
        );
        expect((await call('PATCH', `/chat-sessions/${created.id}`, {})).status).toBe(400);
        expect((await call('PATCH', `/chat-sessions/${randomUUID()}`, { title: 'x' })).status).toBe(
            404,
        );
        expect((await call('PATCH', '/chat-sessions/bad-id', { title: 'x' })).status).toBe(404);
    });

    it('DELETE /chat-sessions/:id answers 204 and removes the chat and its thread', async () => {
        const created = (await call('POST', '/chat-sessions', {})).json as { id: string };
        const { status } = await call('DELETE', `/chat-sessions/${created.id}`);
        expect(status).toBe(204);
        expect(thread.deleted).toEqual([created.id]);
        expect((await call('GET', `/chat-sessions/${created.id}/messages`)).status).toBe(404);
        expect((await call('DELETE', `/chat-sessions/${created.id}`)).status).toBe(404);
        expect((await call('DELETE', '/chat-sessions/bad-id')).status).toBe(404);
    });

    it('POST /sheets-qa/ask answers 404 for an unknown session without calling the agent', async () => {
        const { status } = await call('POST', '/sheets-qa/ask', {
            question: 'Вопрос',
            sessionId: randomUUID(),
        });
        expect(status).toBe(404);
        expect(assistant.asked).toEqual([]);
    });
});
