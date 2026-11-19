import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentRef } from '../../../../shared/agent-capability';
import { StartAgentRunUseCase } from '../../application/start-agent-run.use-case';
import { AgentEvent } from '../../domain/agent-event';
import {
    ChatAttachmentExpiredError,
    ChatAttachmentNotFoundError,
} from '../../domain/chat-attachment.errors';
import { ChatSession } from '../../domain/chat-session';
import { ActiveRunRegistryPort } from '../../domain/ports/active-run-registry.port';
import { AttachmentFilesPort } from '../../domain/ports/attachment-files.port';
import { ChatSessionRepositoryPort } from '../../domain/ports/chat-session-repository.port';
import { ChatThreadPort } from '../../domain/ports/chat-thread.port';
import { AgentRunnerPort, type AgentRunScope } from '../../domain/ports/agent-runner.port';
import type { RunInput } from '../../domain/run-input';
import { ActiveRunRegistry } from '../../infrastructure/active-run-registry';
import {
    ANONYMOUS,
    OTHER_TEST_USER,
    TEST_USER,
    USER_HEADER,
    authenticateByHeader,
} from './testing/authenticate-by-header';
import { AgentController } from './agent.controller';
import { InMemoryChatSessionRepository } from './testing/in-memory-chat-session-repository';

/** Replays scripted events; a step that is a promise is awaited first (lets a test hold the run). */
class ScriptedAssistant extends AgentRunnerPort {
    script: (AgentEvent | Promise<void>)[] = [];
    inputs: RunInput[] = [];
    scopes: AgentRunScope[] = [];
    aborted = false;

    async *stream(
        input: RunInput,
        signal: AbortSignal,
        scope: AgentRunScope,
    ): AsyncIterable<AgentEvent> {
        this.inputs.push(input);
        this.scopes.push(scope);
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

const fakeLogger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };

const OWN_FILE = '11111111-1111-4111-8111-111111111111';
const OWN_FILE_2 = '22222222-2222-4222-8222-222222222222';
const FOREIGN_FILE = '33333333-3333-4333-8333-333333333333';
const DELETED_FILE = '44444444-4444-4444-8444-444444444444';

/** Files of TEST_USER: two active and one deleted; anything else is unknown or foreign. */
class FakeFiles extends AttachmentFilesPort {
    findOwned(ownerId: string, fileIds: readonly string[]): Promise<AttachmentRef[]> {
        const refs: AttachmentRef[] = [];
        for (const fileId of fileIds) {
            if (fileId === DELETED_FILE && ownerId === TEST_USER) {
                return Promise.reject(new ChatAttachmentExpiredError(fileId));
            }
            if (ownerId !== TEST_USER || (fileId !== OWN_FILE && fileId !== OWN_FILE_2)) {
                return Promise.reject(new ChatAttachmentNotFoundError(fileId));
            }
            refs.push(
                AttachmentRef.of({
                    fileId,
                    name: `${fileId.slice(0, 4)}.m4a`,
                    mediaType: 'audio/mp4',
                    kind: 'recording',
                    sizeBytes: 1024,
                }),
            );
        }
        return Promise.resolve(refs);
    }
}

class FakeThread extends ChatThreadPort {
    checkpointId: string | null = null;
    deleted: string[] = [];
    deleteThread(threadId: string): Promise<void> {
        this.deleted.push(threadId);
        return Promise.resolve();
    }
    latestCheckpointId(): Promise<string | null> {
        return Promise.resolve(this.checkpointId);
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
    let registry: ActiveRunRegistry;
    const thread = new FakeThread();
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

    function post(payload: unknown, user?: string): Promise<Response> {
        return fetch(`${base}/agent`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'text/event-stream',
                ...(user === undefined ? {} : { [USER_HEADER]: user }),
            },
            body: JSON.stringify(payload),
        });
    }

    beforeAll(async () => {
        registry = new ActiveRunRegistry();
        const moduleRef = await Test.createTestingModule({
            controllers: [AgentController],
            providers: [
                StartAgentRunUseCase,
                { provide: PinoLogger, useValue: fakeLogger },
                { provide: ChatSessionRepositoryPort, useValue: repository },
                { provide: ChatThreadPort, useValue: thread },
                { provide: ActiveRunRegistryPort, useValue: registry },
                { provide: AgentRunnerPort, useValue: assistant },
                { provide: AttachmentFilesPort, useValue: new FakeFiles() },
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

    beforeEach(async () => {
        repository.sessions.clear();
        repository.messages.clear();
        assistant.script = [];
        assistant.inputs = [];
        assistant.scopes = [];
        thread.deleted = [];
        thread.checkpointId = null;
        assistant.aborted = false;
        const session = await repository.create(
            ChatSession.create({ ownerId: TEST_USER, channel: 'app' }),
        );
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
            'CUSTOM',
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
        expect(events[0]).toMatchObject({ name: 'user-message-saved' });
        expect(events[1]).toMatchObject({ threadId, runId: 'run-1' });
        expect(assistant.inputs[0]).toMatchObject({ threadId, question: 'Сколько стоит МВА?' });
    });

    it('stores the question and the answer in the thread history', async () => {
        assistant.script = [
            AgentEvent.runStarted(),
            AgentEvent.textDelta('Ответ'),
            AgentEvent.runFinished({ answer: 'Ответ', toolCalls: [], durationMs: 3 }),
        ];
        await (await post(body())).text();
        const stored = await repository.listMessages(threadId, TEST_USER);
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
        expect(await repository.listMessages(threadId, TEST_USER)).toHaveLength(1);
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
        expect(await repository.listMessages(threadId, TEST_USER)).toEqual([]);
    });

    it('answers 401 without an authenticated user', async () => {
        expect((await post(body(), ANONYMOUS)).status).toBe(401);
        expect(assistant.inputs).toHaveLength(0);
    });

    it('answers 404 for a chat of another user without calling the agent or storing anything', async () => {
        const response = await post(body(), OTHER_TEST_USER);
        expect(response.status).toBe(404);
        expect(assistant.inputs).toHaveLength(0);
        expect(repository.messages.get(threadId)).toEqual([]);
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
        const stored = await repository.listMessages(threadId, TEST_USER);
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
        expect((await repository.listMessages(threadId, TEST_USER)).map((m) => m.role)).toEqual([
            'user',
        ]);
    });

    describe('attachments', () => {
        const finished = (): AgentEvent[] => [
            AgentEvent.runStarted(),
            AgentEvent.runFinished({ answer: 'ok', toolCalls: [], durationMs: 1 }),
        ];

        it('passes forwardedProps.fileIds to the run and stores them with the question', async () => {
            assistant.script = finished();
            const response = await post(
                body({
                    forwardedProps: { fileIds: [OWN_FILE_2, OWN_FILE] },
                    messages: [{ id: 'm', role: 'user', content: '' }],
                }),
            );
            expect(response.status).toBe(200);
            await response.text();
            expect(assistant.inputs[0]?.question).toBe('');
            expect(assistant.inputs[0]?.attachments.map((a) => a.fileId)).toEqual([
                OWN_FILE_2,
                OWN_FILE,
            ]);
            const [question] = await repository.listMessages(threadId, TEST_USER);
            expect(question.attachments.map((a) => a.fileId)).toEqual([OWN_FILE_2, OWN_FILE]);
        });

        it('accepts a run without a user message text when files are attached', async () => {
            assistant.script = finished();
            const response = await post(
                body({ forwardedProps: { fileIds: [OWN_FILE] }, messages: [] }),
            );
            expect(response.status).toBe(200);
            await response.text();
            expect(assistant.inputs[0]?.attachments).toHaveLength(1);
        });

        it.each([
            ['a foreign file', FOREIGN_FILE],
            ['an unknown file', randomUUID()],
        ])('answers 404 for %s before the stream and stores nothing', async (_name, fileId) => {
            const response = await post(body({ forwardedProps: { fileIds: [fileId] } }));
            expect(response.status).toBe(404);
            expect(response.headers.get('content-type')).not.toContain('text/event-stream');
            expect(await response.json()).toMatchObject({ code: 'FILE_NOT_FOUND' });
            expect(assistant.inputs).toEqual([]);
            expect(await repository.listMessages(threadId, TEST_USER)).toEqual([]);
        });

        it('answers 410 with the expired reason for a deleted file and stores nothing', async () => {
            const response = await post(body({ forwardedProps: { fileIds: [DELETED_FILE] } }));
            expect(response.status).toBe(410);
            const json = (await response.json()) as { code: string; message: string };
            expect(json.code).toBe('FILE_GONE');
            expect(json.message).toContain('Срок хранения файла истёк');
            expect(assistant.inputs).toEqual([]);
            expect(await repository.listMessages(threadId, TEST_USER)).toEqual([]);
        });

        it('answers 400 for 6 files and stores nothing', async () => {
            const fileIds = Array.from({ length: 6 }, () => randomUUID());
            const response = await post(body({ forwardedProps: { fileIds } }));
            expect(response.status).toBe(400);
            expect(assistant.inputs).toEqual([]);
            expect(await repository.listMessages(threadId, TEST_USER)).toEqual([]);
        });

        it.each([
            ['not an array', 'abc'],
            ['not ids', ['not-a-uuid']],
        ])('answers 400 when fileIds are %s', async (_name, fileIds) => {
            const response = await post(body({ forwardedProps: { fileIds } }));
            expect(response.status).toBe(400);
            expect(assistant.inputs).toEqual([]);
        });

        it('answers 400 for no text and no files', async () => {
            const response = await post(
                body({
                    forwardedProps: { fileIds: [] },
                    messages: [{ id: 'm', role: 'user', content: '' }],
                }),
            );
            expect(response.status).toBe(400);
        });
    });

    describe('files in the answer', () => {
        it('streams CUSTOM file-attached before RUN_FINISHED and stores the file with the answer', async () => {
            const doc = AttachmentRef.of({
                fileId: OWN_FILE,
                name: 'Расшифровка.docx',
                mediaType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                kind: 'document',
                sizeBytes: 2048,
            });
            assistant.script = [
                AgentEvent.runStarted(),
                AgentEvent.textDelta('Готово'),
                AgentEvent.fileAttached(doc),
                AgentEvent.runFinished({
                    answer: 'Готово',
                    toolCalls: [],
                    durationMs: 1,
                    attachments: [doc],
                }),
            ];

            const events = parseSse(await (await post(body())).text());

            const custom = events.findIndex(
                (e) => e.type === 'CUSTOM' && e.name === 'file-attached',
            );
            expect(custom).toBeGreaterThan(-1);
            expect(custom).toBeLessThan(events.findIndex((e) => e.type === 'RUN_FINISHED'));
            expect(events[custom]).toMatchObject({
                name: 'file-attached',
                value: { id: OWN_FILE, name: 'Расшифровка.docx', size: 2048, kind: 'document' },
            });
            const answer = (await repository.listMessages(threadId, TEST_USER)).at(-1);
            expect(answer?.attachments.map((a) => a.fileId)).toEqual([OWN_FILE]);
        });
    });

    describe('restart from a message (forwardedProps.replaceFromMessageId)', () => {
        const finishedRun = (answer: string): AgentEvent[] => [
            AgentEvent.runStarted(),
            AgentEvent.textDelta(answer),
            AgentEvent.runFinished({ answer, toolCalls: [], durationMs: 1 }),
        ];

        /** Two rewindable pairs; the second question follows checkpoint cp-1. */
        async function twoPairs(): Promise<{ q1: string; q2: string }> {
            const q1 = await repository.appendUserMessage(threadId, TEST_USER, 'q1', [], {
                checkpointId: null,
            });
            await repository.appendAgentAnswer(threadId, TEST_USER, {
                answer: 'a1',
                toolCalls: [],
                durationMs: 1,
            });
            const q2 = await repository.appendUserMessage(threadId, TEST_USER, 'q2', [], {
                checkpointId: 'cp-1',
            });
            await repository.appendAgentAnswer(threadId, TEST_USER, {
                answer: 'a2',
                toolCalls: [],
                durationMs: 1,
            });
            return { q1: String(q1.id), q2: String(q2.id) };
        }

        const restart = (messageId: string, text = 'новый q2'): Record<string, unknown> =>
            body({
                messages: [{ id: 'm9', role: 'user', content: text }],
                forwardedProps: { replaceFromMessageId: messageId },
            });

        it('replaces the question and the answer; the stream starts with user-message-saved', async () => {
            const { q2 } = await twoPairs();
            assistant.script = finishedRun('новый a2');

            const response = await post(restart(q2));

            expect(response.status).toBe(200);
            const events = parseSse(await response.text());
            const stored = await repository.listMessages(threadId, TEST_USER);
            expect(stored.map((m) => m.text)).toEqual(['q1', 'a1', 'новый q2', 'новый a2']);
            expect(events[0]).toMatchObject({
                type: 'CUSTOM',
                name: 'user-message-saved',
                value: { messageId: String(stored[2]?.id) },
            });
            expect(events[1]?.type).toBe('RUN_STARTED');
        });

        it('starts the agent from the checkpoint of the replaced question', async () => {
            const { q2 } = await twoPairs();
            assistant.script = finishedRun('x');
            await (await post(restart(q2))).text();
            expect(assistant.scopes[0]).toMatchObject({ fromCheckpointId: 'cp-1' });
        });

        it('for the first question drops the agent context and starts without a checkpoint', async () => {
            const { q1 } = await twoPairs();
            assistant.script = finishedRun('x');
            await (await post(restart(q1, 'новый q1'))).text();
            expect(thread.deleted).toEqual([threadId]);
            expect(assistant.scopes[0]?.fromCheckpointId).toBeUndefined();
            const stored = await repository.listMessages(threadId, TEST_USER);
            expect(stored.map((m) => m.text)).toEqual(['новый q1', 'x']);
        });

        it('keeps the title of the chat', async () => {
            const { q1 } = await twoPairs();
            assistant.script = finishedRun('x');
            const before = (await repository.findById(threadId))?.title.value;
            await (await post(restart(q1, 'совсем другой вопрос'))).text();
            expect((await repository.findById(threadId))?.title.value).toBe(before);
        });

        it('ignores fileIds of the request: the files come from the replaced question', async () => {
            const q = await repository.appendUserMessage(threadId, TEST_USER, 'q', [OWN_FILE], {
                checkpointId: null,
            });
            assistant.script = finishedRun('x');
            await (
                await post(
                    body({
                        messages: [{ id: 'm9', role: 'user', content: 'новый' }],
                        forwardedProps: {
                            replaceFromMessageId: String(q.id),
                            fileIds: [OWN_FILE_2],
                        },
                    }),
                )
            ).text();
            expect(assistant.inputs[0]?.attachments.map((file) => file.fileId)).toEqual([OWN_FILE]);
        });

        it('answers 404 for an agent message, an unknown id and a message of another chat, before the stream', async () => {
            await twoPairs();
            const stored = await repository.listMessages(threadId, TEST_USER);
            const agent = stored.find((m) => m.role === 'agent');
            const other = await repository.create(
                ChatSession.create({ ownerId: TEST_USER, channel: 'app' }),
            );
            const foreign = await repository.appendUserMessage(other.id, TEST_USER, 'x', [], {
                checkpointId: null,
            });
            for (const id of [String(agent?.id), '99999', String(foreign.id), 'abc']) {
                const response = await post(restart(id));
                expect(response.status).toBe(404);
                expect(response.headers.get('content-type')).not.toContain('text/event-stream');
            }
            expect(assistant.inputs).toEqual([]);
            expect(await repository.listMessages(threadId, TEST_USER)).toHaveLength(4);
        });

        it('answers 422 MESSAGE_NOT_EDITABLE for a question without a rewind point, changing nothing', async () => {
            const old = await repository.appendUserMessage(threadId, TEST_USER, 'старый');
            const response = await post(restart(String(old.id)));
            expect(response.status).toBe(422);
            expect(await response.json()).toMatchObject({ code: 'MESSAGE_NOT_EDITABLE' });
            expect(assistant.inputs).toEqual([]);
            expect(await repository.listMessages(threadId, TEST_USER)).toHaveLength(1);
        });

        it('answers 409 while the chat is running and leaves the history intact', async () => {
            const { q2 } = await twoPairs();
            const hold = deferred();
            assistant.script = [AgentEvent.runStarted(), hold.promise];
            const first = await post(body({ runId: 'run-a' }));
            const reader = first.body?.getReader();
            await reader?.read();
            await reader?.cancel();
            await waitFor(() => registry.isRunning(threadId));
            const before = (await repository.listMessages(threadId, TEST_USER)).map((m) => m.text);

            const second = await post({ ...restart(q2), runId: 'run-b' });

            expect(second.status).toBe(409);
            expect(second.headers.get('content-type')).not.toContain('text/event-stream');
            const after = (await repository.listMessages(threadId, TEST_USER)).map((m) => m.text);
            expect(after).toEqual([...before.slice(0, 4), 'Сколько стоит МВА?']);
            hold.resolve();
        });

        it('answers 400 for a replaceFromMessageId that is not a string', async () => {
            const response = await post(body({ forwardedProps: { replaceFromMessageId: 5 } }));
            expect(response.status).toBe(400);
        });

        it("answers 404 for another user's chat", async () => {
            const { q2 } = await twoPairs();
            const response = await post(restart(q2), OTHER_TEST_USER);
            expect(response.status).toBe(404);
            expect(await repository.listMessages(threadId, TEST_USER)).toHaveLength(4);
        });
    });
});
