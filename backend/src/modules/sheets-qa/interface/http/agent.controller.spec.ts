import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StartAgentRunUseCase } from '../../application/start-agent-run.use-case';
import { AgentEvent } from '../../domain/agent-event';
import { ChatSession } from '../../domain/chat-session';
import { ActiveRunRegistryPort } from '../../domain/ports/active-run-registry.port';
import { ChatSessionRepositoryPort } from '../../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../../domain/ports/chat-thread.port';
import { SheetsAssistantPort } from '../../domain/ports/sheets-assistant.port';
import type { RunInput } from '../../domain/run-input';
import { InMemoryActiveRunRegistry } from '../../infrastructure/in-memory-active-run-registry';
import { AgentController } from './agent.controller';
import { InMemoryChatSessionRepository } from './testing/in-memory-chat-session-repository';

/** Replays scripted events; a step that is a promise is awaited first (lets a test hold the run). */
class ScriptedAssistant extends SheetsAssistantPort {
    script: (AgentEvent | Promise<void>)[] = [];
    inputs: RunInput[] = [];
    aborted = false;

    async *stream(input: RunInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
        this.inputs.push(input);
        signal.addEventListener('abort', () => {
            this.aborted = true;
        });
        for (const step of this.script) {
            if (step instanceof Promise) {
                await Promise.race([
                    step,
                    new Promise<void>((resolve) => {
                        signal.addEventListener('abort', () => {
                            resolve();
                        });
                    }),
                ]);
                if (signal.aborted) {
                    yield AgentEvent.runCancelled();
                    return;
                }
            } else {
                yield step;
            }
        }
    }
}

class FakeThread extends ChatThreadPort {
    deleteThread(): Promise<void> {
        return Promise.resolve();
    }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

function parseSse(text: string): { type: string; [key: string]: unknown }[] {
    return text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string });
}

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
    for (let i = 0; i < 200; i++) {
        if (await condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('condition was not met in time');
}

describe('AgentController', () => {
    let app: INestApplication;
    let base: string;
    const assistant = new ScriptedAssistant();
    const repository = new InMemoryChatSessionRepository();
    let registry: InMemoryActiveRunRegistry;
    let threadId: string;

    function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            threadId,
            runId: 'run-1',
            state: {},
            tools: [],
            context: [],
            forwardedProps: {},
            messages: [{ id: 'm1', role: 'user', content: 'Сколько стоит МВА?' }],
            ...overrides,
        };
    }

    function post(payload: unknown): Promise<Response> {
        return fetch(`${base}/agent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
            body: JSON.stringify(payload),
        });
    }

    beforeAll(async () => {
        registry = new InMemoryActiveRunRegistry();
        const moduleRef = await Test.createTestingModule({
            controllers: [AgentController],
            providers: [
                StartAgentRunUseCase,
                { provide: ChatSessionRepositoryPort, useValue: repository },
                { provide: ChatThreadPort, useValue: new FakeThread() },
                { provide: ActiveRunRegistryPort, useValue: registry },
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

    beforeEach(async () => {
        repository.sessions.clear();
        repository.messages.clear();
        assistant.script = [];
        assistant.inputs = [];
        assistant.aborted = false;
        const session = await repository.create(ChatSession.create());
        threadId = session.id;
    });

    it('streams a run as AG-UI SSE events in order', async () => {
        assistant.script = [
            AgentEvent.runStarted(),
            AgentEvent.textDelta('Сей'),
            AgentEvent.textDelta('час. '),
            AgentEvent.toolCallStarted('c1', 'search_rows', { query: 'МВА' }),
            AgentEvent.toolCallFinished('c1'),
            AgentEvent.textDelta('Готово'),
            AgentEvent.runFinished({ answer: 'Сейчас. Готово', toolCalls: [], durationMs: 3 }),
        ];

        const response = await post(body());

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        const events = parseSse(await response.text());
        expect(events.map((event) => event.type)).toEqual([
            'RUN_STARTED',
            'TEXT_MESSAGE_START',
            'TEXT_MESSAGE_CONTENT',
            'TEXT_MESSAGE_CONTENT',
            'TEXT_MESSAGE_END',
            'TOOL_CALL_START',
            'TOOL_CALL_ARGS',
            'TOOL_CALL_END',
            'TOOL_CALL_RESULT',
            'TEXT_MESSAGE_START',
            'TEXT_MESSAGE_CONTENT',
            'TEXT_MESSAGE_END',
            'RUN_FINISHED',
        ]);
        expect(events[0]).toMatchObject({ threadId, runId: 'run-1' });
        expect(assistant.inputs[0]).toMatchObject({ threadId, question: 'Сколько стоит МВА?' });
    });

    it('stores the question and the answer in the thread history', async () => {
        assistant.script = [
            AgentEvent.runStarted(),
            AgentEvent.textDelta('Ответ'),
            AgentEvent.runFinished({ answer: 'Ответ', toolCalls: [], durationMs: 3 }),
        ];
        await (await post(body())).text();
        const stored = await repository.listMessages(threadId);
        expect(stored.map((m) => [m.role, m.text])).toEqual([
            ['user', 'Сколько стоит МВА?'],
            ['agent', 'Ответ'],
        ]);
    });

    it('uses only the last user message of the input as the question', async () => {
        assistant.script = [
            AgentEvent.runStarted(),
            AgentEvent.runFinished({ answer: 'x', toolCalls: [], durationMs: 1 }),
        ];
        await (
            await post(
                body({
                    messages: [
                        { id: 'm1', role: 'user', content: 'Старый вопрос' },
                        { id: 'm2', role: 'assistant', content: 'Старый ответ' },
                        {
                            id: 'm3',
                            role: 'user',
                            content: [{ type: 'text', text: 'Новый вопрос' }],
                        },
                    ],
                }),
            )
        ).text();
        expect(assistant.inputs[0]?.question).toBe('Новый вопрос');
    });

    it('ends the stream with RUN_ERROR when the agent fails', async () => {
        assistant.script = [AgentEvent.runStarted(), AgentEvent.runFailed('Превышено время')];
        const events = parseSse(await (await post(body())).text());
        expect(events.at(-1)).toMatchObject({ type: 'RUN_ERROR', message: 'Превышено время' });
        expect(await repository.listMessages(threadId)).toHaveLength(1);
    });

    it.each([
        ['a body that is not an object', 'oops'],
        ['a missing threadId', { runId: 'r', messages: [{ id: 'm', role: 'user', content: 'q' }] }],
        ['a missing runId', { threadId: 't', messages: [{ id: 'm', role: 'user', content: 'q' }] }],
        ['messages that are not an array', { threadId: 't', runId: 'r', messages: 'q' }],
        ['no user message', { threadId: 't', runId: 'r', messages: [] }],
    ])('answers 400 for %s', async (_name, payload) => {
        const response = await post(payload);
        expect(response.status).toBe(400);
        expect(assistant.inputs).toEqual([]);
    });

    it('answers 400 for an empty or too long question and stores nothing', async () => {
        const empty = await post(body({ messages: [{ id: 'm', role: 'user', content: '   ' }] }));
        expect(empty.status).toBe(400);
        const long = await post(
            body({ messages: [{ id: 'm', role: 'user', content: 'я'.repeat(2001) }] }),
        );
        expect(long.status).toBe(400);
        expect(await repository.listMessages(threadId)).toEqual([]);
    });

    it('answers 404 for an unknown or malformed thread without calling the agent', async () => {
        expect((await post(body({ threadId: randomUUID() }))).status).toBe(404);
        expect((await post(body({ threadId: 'not-a-uuid' }))).status).toBe(404);
        expect(assistant.inputs).toEqual([]);
    });

    it('answers 409 (not a stream) while the chat has an active run, even without a connection', async () => {
        const hold = deferred();
        assistant.script = [AgentEvent.runStarted(), hold.promise];
        const first = await post(body());
        const reader = first.body?.getReader();
        await reader?.read();
        await reader?.cancel(); // the connection is gone, the run lives on
        await waitFor(() => registry.isRunning(threadId));

        const second = await post(body({ runId: 'run-2' }));

        expect(second.status).toBe(409);
        expect(second.headers.get('content-type')).not.toContain('text/event-stream');
        expect(registry.isRunning(threadId)).toBe(true);
        hold.resolve();
    });

    it('does not cancel the run when the connection closes, and stores the answer later', async () => {
        const hold = deferred();
        assistant.script = [
            AgentEvent.runStarted(),
            AgentEvent.textDelta('Часть'),
            hold.promise,
            AgentEvent.runFinished({ answer: 'Часть. Конец', toolCalls: [], durationMs: 3 }),
        ];
        const response = await post(body());
        const reader = response.body?.getReader();
        await reader?.read();
        await reader?.cancel();

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(assistant.aborted).toBe(false);
        expect(registry.isRunning(threadId)).toBe(true);

        hold.resolve();
        await waitFor(() => !registry.isRunning(threadId));
        const stored = await repository.listMessages(threadId);
        expect(stored.at(-1)).toMatchObject({ role: 'agent', text: 'Часть. Конец' });
    });

    it('ends an open stream with a cancelled RUN_FINISHED when the run is cancelled', async () => {
        const hold = deferred();
        assistant.script = [AgentEvent.runStarted(), AgentEvent.textDelta('Часть'), hold.promise];
        const pending = post(body()).then((response) => response.text());
        await waitFor(() => registry.isRunning(threadId));
        registry.cancel(threadId);

        const events = parseSse(await pending);

        expect(events.at(-1)).toMatchObject({
            type: 'RUN_FINISHED',
            outcome: { type: 'cancelled' },
        });
        expect((await repository.listMessages(threadId)).map((m) => m.role)).toEqual(['user']);
    });
});
