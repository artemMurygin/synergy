import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AgentEvent } from '../domain/agent-event';
import { AgentRun } from '../domain/agent-run';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import type { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { ChatThreadPort } from '../domain/ports/chat-thread.port';
import type { SheetsAssistantPort } from '../domain/ports/sheets-assistant.port';
import { RunConflictError } from '../domain/run-conflict.error';
import { MAX_QUESTION_LENGTH, type RunInputProps } from '../domain/run-input';
import {
    InvalidQuestionError,
    StartAgentRunUseCase,
    type RunObserver,
} from './start-agent-run.use-case';

const FINISHED = AgentEvent.runFinished({ answer: 'ok', toolCalls: [], durationMs: 1 });

type StreamFn = (signal: AbortSignal) => AsyncIterable<AgentEvent>;

interface Deferred {
    promise: Promise<void>;
    resolve: () => void;
}

function deferred(): Deferred {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

async function* emit(...events: AgentEvent[]): AsyncGenerator<AgentEvent> {
    await Promise.resolve();
    for (const event of events) yield event;
}

type Mock = ReturnType<typeof vi.fn>;

interface Setup {
    useCase: StartAgentRunUseCase;
    tryStart: Mock;
    release: Mock;
    runs: Map<string, AgentRun>;
    findById: Mock;
    appendUserMessage: Mock;
    appendAgentAnswer: Mock;
    stream: Mock;
    deleteThread: Mock;
    events: AgentEvent[];
    observer: RunObserver;
    closed: Promise<void>;
    calls: string[];
    logger: { setContext: Mock; warn: Mock; error: Mock };
}

function setup(options: { session?: ChatSession | null; stream?: StreamFn } = {}): Setup {
    const session = options.session === undefined ? ChatSession.create() : options.session;
    const calls: string[] = [];
    const runs = new Map<string, AgentRun>();

    const tryStart = vi.fn((threadId: string, runId: string) => {
        calls.push('tryStart');
        if (runs.has(threadId)) return null;
        const run = AgentRun.start({ threadId, runId });
        runs.set(threadId, run);
        return run;
    });
    const release = vi.fn((threadId: string, runId: string) => {
        calls.push('release');
        if (runs.get(threadId)?.runId === runId) runs.delete(threadId);
    });
    const registry = { tryStart, release } as unknown as ActiveRunRegistryPort;

    const findById = vi.fn(() => {
        calls.push('find');
        return Promise.resolve(session);
    });
    const appendUserMessage = vi.fn(() => {
        calls.push('appendUser');
        return Promise.resolve({});
    });
    const appendAgentAnswer = vi.fn(() => {
        calls.push('appendAgent');
        return Promise.resolve({});
    });
    const sessions = {
        findById,
        appendUserMessage,
        appendAgentAnswer,
    } as unknown as ChatSessionRepositoryPort;

    const stream = vi.fn((_input: unknown, signal: AbortSignal) => {
        calls.push('stream');
        return (options.stream ?? (() => emit(AgentEvent.runStarted(), FINISHED)))(signal);
    });
    const assistant = { stream } as unknown as SheetsAssistantPort;

    const deleteThread = vi.fn().mockResolvedValue(undefined);
    const threads = { deleteThread } as unknown as ChatThreadPort;

    const events: AgentEvent[] = [];
    let onClose: () => void = () => undefined;
    const closed = new Promise<void>((resolve) => {
        onClose = resolve;
    });
    const observer: RunObserver = {
        next: (event) => {
            events.push(event);
            calls.push(`next:${event.type}`);
        },
        close: () => {
            calls.push('close');
            onClose();
        },
    };

    const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };

    return {
        useCase: new StartAgentRunUseCase(
            assistant,
            sessions,
            threads,
            registry,
            logger as unknown as PinoLogger,
        ),
        logger,
        tryStart,
        release,
        runs,
        findById,
        appendUserMessage,
        appendAgentAnswer,
        stream,
        deleteThread,
        events,
        observer,
        closed,
        calls,
    };
}

const input = (question = 'Сколько стоит?', threadId = 's1'): RunInputProps => ({
    threadId,
    runId: 'r1',
    question,
});

describe('StartAgentRunUseCase', () => {
    it('rejects an empty question without writes or agent call', async () => {
        const { useCase, observer, appendUserMessage, stream, tryStart } = setup();
        await expect(useCase.execute(input('   '), observer)).rejects.toBeInstanceOf(
            InvalidQuestionError,
        );
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(stream).not.toHaveBeenCalled();
        expect(tryStart).not.toHaveBeenCalled();
    });

    it('rejects a too long question without writes', async () => {
        const { useCase, observer, appendUserMessage, stream } = setup();
        await expect(
            useCase.execute(input('я'.repeat(MAX_QUESTION_LENGTH + 1)), observer),
        ).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(stream).not.toHaveBeenCalled();
    });

    it('rejects an empty thread id', async () => {
        const { useCase, observer, stream } = setup();
        await expect(useCase.execute(input('Вопрос', ' '), observer)).rejects.toBeInstanceOf(
            InvalidQuestionError,
        );
        expect(stream).not.toHaveBeenCalled();
    });

    it('fails with not found for an unknown chat, without agent call or writes', async () => {
        const { useCase, observer, appendUserMessage, stream, runs } = setup({ session: null });
        await expect(useCase.execute(input(), observer)).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        expect(stream).not.toHaveBeenCalled();
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(runs.size).toBe(0);
    });

    it('fails with a conflict when the chat already has an active run', async () => {
        const { useCase, observer, runs, appendUserMessage, stream } = setup();
        runs.set('s1', AgentRun.start({ threadId: 's1', runId: 'other' }));
        await expect(useCase.execute(input(), observer)).rejects.toBeInstanceOf(RunConflictError);
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(stream).not.toHaveBeenCalled();
        expect(runs.get('s1')?.runId).toBe('other');
    });

    it('stores the trimmed question before the agent starts', async () => {
        const { useCase, observer, closed, calls, appendUserMessage, stream } = setup();
        await useCase.execute(input('  Сколько стоит?  '), observer);
        await closed;
        expect(appendUserMessage).toHaveBeenCalledWith('s1', 'Сколько стоит?');
        expect(calls.indexOf('appendUser')).toBeLessThan(calls.indexOf('stream'));
        const passed = stream.mock.calls[0]?.[0] as { question: string; threadId: string };
        expect(passed).toMatchObject({ question: 'Сколько стоит?', threadId: 's1', runId: 'r1' });
    });

    it('returns the registered running run', async () => {
        const gate = deferred();
        const { useCase, observer, closed } = setup({
            stream: () =>
                (async function* () {
                    await gate.promise;
                    yield FINISHED;
                })(),
        });
        const run = await useCase.execute(input(), observer);
        expect(run.runId).toBe('r1');
        expect(run.threadId).toBe('s1');
        expect(run.status).toBe('running');
        gate.resolve();
        await closed;
    });

    it('forwards events to the observer in order', async () => {
        const delta = AgentEvent.textDelta('при');
        const { useCase, observer, closed, events } = setup({
            stream: () => emit(AgentEvent.runStarted(), delta, FINISHED),
        });
        await useCase.execute(input(), observer);
        await closed;
        expect(events).toEqual([AgentEvent.runStarted(), delta, FINISHED]);
    });

    it('stores the answer with an auto title on run-finished and marks the run finished', async () => {
        const { useCase, observer, closed, appendAgentAnswer, release } = setup();
        const run = await useCase.execute(input('  Сколько стоит МВА? '), observer);
        await closed;
        expect(appendAgentAnswer).toHaveBeenCalledOnce();
        const args = appendAgentAnswer.mock.calls[0] as unknown as [string, unknown, ChatTitle];
        expect(args[0]).toBe('s1');
        expect(args[1]).toMatchObject({ answer: 'ok', toolCalls: [], durationMs: 1 });
        expect(args[2].value).toBe('Сколько стоит МВА?');
        expect(run.status).toBe('finished');
        expect(release).toHaveBeenCalledWith('s1', 'r1');
    });

    it('does not propose an auto title for a custom-titled chat', async () => {
        const { useCase, observer, closed, appendAgentAnswer } = setup({
            session: ChatSession.create(ChatTitle.of('Цены')),
        });
        await useCase.execute(input(), observer);
        await closed;
        expect((appendAgentAnswer.mock.calls[0] as unknown[])[2]).toBeUndefined();
    });

    it('stores the answer and releases the run before the terminal event reaches the observer', async () => {
        const { useCase, observer, closed, calls } = setup();
        await useCase.execute(input(), observer);
        await closed;
        const terminal = calls.indexOf('next:run-finished');
        expect(calls.indexOf('appendAgent')).toBeLessThan(terminal);
        expect(calls.indexOf('release')).toBeLessThan(terminal);
    });

    it('keeps the question and writes no answer on run-failed', async () => {
        const failed = AgentEvent.runFailed('boom');
        const { useCase, observer, closed, appendAgentAnswer, appendUserMessage, events, runs } =
            setup({ stream: () => emit(AgentEvent.runStarted(), failed) });
        const run = await useCase.execute(input(), observer);
        await closed;
        expect(appendUserMessage).toHaveBeenCalledOnce();
        expect(appendAgentAnswer).not.toHaveBeenCalled();
        expect(events.at(-1)).toEqual(failed);
        expect(run.status).toBe('failed');
        expect(runs.size).toBe(0);
    });

    it('writes no answer on run-cancelled and releases the run', async () => {
        const { useCase, observer, closed, appendAgentAnswer, runs, events } = setup({
            stream: () => emit(AgentEvent.runStarted(), AgentEvent.runCancelled()),
        });
        const run = await useCase.execute(input(), observer);
        await closed;
        expect(appendAgentAnswer).not.toHaveBeenCalled();
        expect(events.at(-1)).toEqual(AgentEvent.runCancelled());
        expect(run.status).toBe('cancelled');
        expect(runs.size).toBe(0);
    });

    it('handles cancellation requested through the run while streaming', async () => {
        const { useCase, observer, closed, appendAgentAnswer, runs } = setup({
            stream: (signal) =>
                (async function* () {
                    await new Promise<void>((resolve) => {
                        signal.addEventListener('abort', () => {
                            resolve();
                        });
                    });
                    yield AgentEvent.runCancelled();
                })(),
        });
        const run = await useCase.execute(input(), observer);
        run.cancel();
        await closed;
        expect(run.status).toBe('cancelled');
        expect(appendAgentAnswer).not.toHaveBeenCalled();
        expect(runs.size).toBe(0);
    });

    it('turns an exception of the stream into run-failed and releases the run', async () => {
        const { useCase, observer, closed, events, appendAgentAnswer, runs } = setup({
            stream: () =>
                (async function* () {
                    await Promise.resolve();
                    yield AgentEvent.runStarted();
                    throw new Error('stream broke');
                })(),
        });
        const run = await useCase.execute(input(), observer);
        await closed;
        expect(events.at(-1)).toMatchObject({ type: 'run-failed' });
        expect(appendAgentAnswer).not.toHaveBeenCalled();
        expect(run.status).toBe('failed');
        expect(runs.size).toBe(0);
    });

    it('treats a stream that ends without a terminal event as failed', async () => {
        const { useCase, observer, closed, events, runs } = setup({
            stream: () => emit(AgentEvent.runStarted()),
        });
        const run = await useCase.execute(input(), observer);
        await closed;
        expect(events.at(-1)).toMatchObject({ type: 'run-failed' });
        expect(run.status).toBe('failed');
        expect(runs.size).toBe(0);
    });

    it('releases the run and rethrows when the question cannot be stored', async () => {
        const { useCase, observer, appendUserMessage, runs, stream } = setup();
        appendUserMessage.mockRejectedValueOnce(new Error('db down'));
        await expect(useCase.execute(input(), observer)).rejects.toThrow('db down');
        expect(runs.size).toBe(0);
        expect(stream).not.toHaveBeenCalled();
    });

    it('fails with not found when the question cannot be stored because the chat was deleted', async () => {
        const { useCase, observer, appendUserMessage, findById, runs, stream } = setup();
        findById.mockResolvedValueOnce(ChatSession.create()).mockResolvedValue(null);
        appendUserMessage.mockRejectedValueOnce(new Error('foreign key violation'));
        await expect(useCase.execute(input(), observer)).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        expect(runs.size).toBe(0);
        expect(stream).not.toHaveBeenCalled();
    });

    it('does not store the answer and reports cancellation when the run was aborted before run-finished', async () => {
        const gate = deferred();
        const { useCase, observer, closed, appendAgentAnswer, events } = setup({
            stream: () =>
                (async function* () {
                    await gate.promise;
                    yield FINISHED;
                })(),
        });
        const run = await useCase.execute(input(), observer);
        run.cancel();
        gate.resolve();
        await closed;
        expect(appendAgentAnswer).not.toHaveBeenCalled();
        expect(events.at(-1)).toEqual(AgentEvent.runCancelled());
        expect(run.status).toBe('cancelled');
    });

    it('does not leak the internal error text of a broken stream to the observer', async () => {
        const { useCase, observer, closed, events, logger } = setup({
            stream: () =>
                (async function* () {
                    await Promise.resolve();
                    yield AgentEvent.runStarted();
                    throw new Error('secret internal detail');
                })(),
        });
        await useCase.execute(input(), observer);
        await closed;
        const last = events.at(-1);
        expect(last).toMatchObject({ type: 'run-failed' });
        expect(JSON.stringify(last)).not.toContain('secret internal detail');
        expect(logger.error).toHaveBeenCalled();
    });

    it('does not leak the error text of a failed answer storage to the observer', async () => {
        const { useCase, observer, closed, events, appendAgentAnswer } = setup();
        appendAgentAnswer.mockRejectedValueOnce(new Error('db password wrong'));
        await useCase.execute(input(), observer);
        await closed;
        const last = events.at(-1);
        expect(last).toMatchObject({ type: 'run-failed' });
        expect(JSON.stringify(last)).not.toContain('db password wrong');
    });

    it('keeps running and stores the answer after the observer detached', async () => {
        const gate = deferred();
        const { useCase, appendAgentAnswer, runs } = setup({
            stream: () =>
                (async function* () {
                    yield AgentEvent.runStarted();
                    await gate.promise;
                    yield AgentEvent.textDelta('x');
                    yield FINISHED;
                })(),
        });
        const received: AgentEvent[] = [];
        let attached = true;
        const done = deferred();
        const observer: RunObserver = {
            next: (event) => {
                if (attached) received.push(event);
            },
            close: () => {
                done.resolve();
            },
        };
        const run = await useCase.execute(input(), observer);
        await vi.waitFor(() => {
            expect(received).toHaveLength(1);
        });
        attached = false; // detach: the connection is gone
        gate.resolve();
        await done.promise;
        expect(received).toEqual([AgentEvent.runStarted()]);
        expect(run.status).toBe('finished');
        expect(appendAgentAnswer).toHaveBeenCalledOnce();
        expect(runs.size).toBe(0);
    });

    it('is not interrupted by an exception thrown in the observer', async () => {
        const { useCase, appendAgentAnswer, runs } = setup();
        const done = deferred();
        const next = vi.fn(() => {
            throw new Error('socket closed');
        });
        const run = await useCase.execute(input(), {
            next,
            close: () => {
                done.resolve();
            },
        });
        await done.promise;
        expect(next).toHaveBeenCalledTimes(2);
        expect(run.status).toBe('finished');
        expect(appendAgentAnswer).toHaveBeenCalledOnce();
        expect(runs.size).toBe(0);
    });

    it('is not interrupted by an exception thrown in observer.close', async () => {
        const { useCase, runs, appendAgentAnswer } = setup();
        const closeCalled = deferred();
        const run = await useCase.execute(input(), {
            next: () => undefined,
            close: () => {
                closeCalled.resolve();
                throw new Error('close failed');
            },
        });
        await closeCalled.promise;
        await vi.waitFor(() => {
            expect(runs.size).toBe(0);
        });
        expect(run.status).toBe('finished');
        expect(appendAgentAnswer).toHaveBeenCalledOnce();
    });

    it('removes the agent thread when the chat was deleted during the run', async () => {
        const { useCase, observer, closed, findById, appendAgentAnswer, deleteThread, runs } =
            setup();
        findById.mockResolvedValueOnce(ChatSession.create()).mockResolvedValue(null);
        appendAgentAnswer.mockRejectedValueOnce(new ChatSessionNotFoundError('s1'));
        await useCase.execute(input(), observer);
        await closed;
        expect(deleteThread).toHaveBeenCalledWith('s1');
        expect(runs.size).toBe(0);
    });

    it('removes the agent thread when a cancelled run belongs to a deleted chat', async () => {
        const { useCase, observer, closed, findById, deleteThread } = setup({
            stream: () => emit(AgentEvent.runCancelled()),
        });
        findById.mockResolvedValueOnce(ChatSession.create()).mockResolvedValue(null);
        await useCase.execute(input(), observer);
        await closed;
        expect(deleteThread).toHaveBeenCalledWith('s1');
    });

    it('does not touch the agent thread while the chat exists', async () => {
        const { useCase, observer, closed, deleteThread } = setup();
        await useCase.execute(input(), observer);
        await closed;
        expect(deleteThread).not.toHaveBeenCalled();
    });
});
