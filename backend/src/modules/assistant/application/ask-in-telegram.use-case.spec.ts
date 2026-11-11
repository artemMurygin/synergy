import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AgentEvent } from '../domain/agent-event';
import { AgentRun } from '../domain/agent-run';
import { ChatSession } from '../domain/chat-session';
import type { ActiveRunRegistryPort } from '../domain/ports/active-run-registry.port';
import type { AgentRunnerPort, AgentRunScope } from '../domain/ports/agent-runner.port';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { RunInput } from '../domain/run-input';
import {
    AskInTelegramUseCase,
    TELEGRAM_BUSY_MESSAGE,
    TELEGRAM_FAILED_MESSAGE,
    TELEGRAM_TOO_LONG_MESSAGE,
} from './ask-in-telegram.use-case';

const OWNER = 'user-1';

type StreamMock = (
    input: RunInput,
    signal: AbortSignal,
    scope: AgentRunScope,
) => AsyncIterable<AgentEvent>;

type Mock = ReturnType<typeof vi.fn>;

interface Setup {
    session: ChatSession;
    runs: Map<string, AgentRun>;
    tryStart: Mock;
    release: Mock;
    findOrCreateTelegram: Mock;
    appendUserMessage: Mock;
    appendAgentAnswer: Mock;
    list: Mock;
    findOwned: Mock;
    stream: ReturnType<typeof vi.fn<StreamMock>>;
    useCase: AskInTelegramUseCase;
}

type StreamFn = (input: RunInput, signal: AbortSignal) => AsyncIterable<AgentEvent>;

async function* emit(...events: AgentEvent[]): AsyncGenerator<AgentEvent> {
    await Promise.resolve();
    for (const event of events) yield event;
}

const finished = (answer: string): AgentEvent =>
    AgentEvent.runFinished({ answer, toolCalls: [], durationMs: 5 });

function setup(options: { stream?: StreamFn; failStore?: boolean } = {}): Setup {
    const session = ChatSession.create({ ownerId: OWNER, channel: 'telegram' });
    const runs = new Map<string, AgentRun>();
    const tryStart = vi.fn((threadId: string, runId: string) => {
        if (runs.has(threadId)) return null;
        const run = AgentRun.start({ threadId, runId });
        runs.set(threadId, run);
        return run;
    });
    const release = vi.fn((threadId: string, runId: string) => {
        if (runs.get(threadId)?.runId === runId) runs.delete(threadId);
    });
    const registry = { tryStart, release } as unknown as ActiveRunRegistryPort;

    const findOrCreateTelegram = vi.fn(() => Promise.resolve(session));
    const appendUserMessage = vi.fn(() => Promise.resolve({}));
    const appendAgentAnswer = vi.fn(() =>
        options.failStore === true ? Promise.reject(new Error('db down')) : Promise.resolve({}),
    );
    const list = vi.fn();
    const findOwned = vi.fn();
    const sessions = {
        findOrCreateTelegram,
        appendUserMessage,
        appendAgentAnswer,
        list,
        findOwned,
    } as unknown as ChatSessionRepositoryPort;

    const stream = vi.fn<StreamMock>((input, signal) =>
        (options.stream ?? (() => emit(AgentEvent.runStarted(), finished('Готово'))))(
            input,
            signal,
        ),
    );
    const runner = { stream } as unknown as AgentRunnerPort;
    const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() };

    return {
        session,
        runs,
        tryStart,
        release,
        findOrCreateTelegram,
        appendUserMessage,
        appendAgentAnswer,
        list,
        findOwned,
        stream,
        useCase: new AskInTelegramUseCase(
            runner,
            sessions,
            registry,
            logger as unknown as PinoLogger,
        ),
    };
}

describe('AskInTelegramUseCase', () => {
    it('runs the telegram profile in the dialog of the owner and returns the final text', async () => {
        const s = setup();

        const reply = await s.useCase.execute(OWNER, '  поставь Пете задачу  ');

        expect(reply).toBe('Готово');
        expect(s.findOrCreateTelegram).toHaveBeenCalledWith(OWNER);
        expect(s.stream).toHaveBeenCalledTimes(1);
        const [input, , scope] = s.stream.mock.calls[0];
        expect(input.threadId).toBe(s.session.id);
        expect(input.question).toBe('поставь Пете задачу');
        expect(scope).toEqual({ userId: OWNER, client: 'telegram' });
    });

    it('stores the question and the answer in the dialog and releases the run', async () => {
        const s = setup();

        await s.useCase.execute(OWNER, 'привет');

        expect(s.appendUserMessage).toHaveBeenCalledWith(s.session.id, OWNER, 'привет');
        expect(s.appendAgentAnswer).toHaveBeenCalledWith(s.session.id, OWNER, {
            answer: 'Готово',
            toolCalls: [],
            durationMs: 5,
        });
        expect(s.runs.size).toBe(0);
    });

    it('asks to wait when the dialog already has an active run and does not start the agent', async () => {
        const s = setup();
        s.runs.set(s.session.id, AgentRun.start({ threadId: s.session.id, runId: 'other' }));

        await expect(s.useCase.execute(OWNER, 'ещё одно')).resolves.toBe(TELEGRAM_BUSY_MESSAGE);

        expect(TELEGRAM_BUSY_MESSAGE).toContain('подождите ответа на предыдущее сообщение');
        expect(s.stream).not.toHaveBeenCalled();
        expect(s.appendUserMessage).not.toHaveBeenCalled();
        expect(s.runs.size).toBe(1);
    });

    it.each([
        [
            'a failed run',
            () => emit(AgentEvent.runStarted(), AgentEvent.runFailed('Превышено время')),
        ],
        ['a cancelled run', () => emit(AgentEvent.runCancelled())],
        [
            'a thrown error',
            // eslint-disable-next-line require-yield
            async function* (): AsyncGenerator<AgentEvent> {
                await Promise.resolve();
                throw new Error('model is down');
            },
        ],
        ['a stream without a result', () => emit(AgentEvent.runStarted())],
    ])('answers with the failure message for %s', async (_name, stream) => {
        const s = setup({ stream });

        await expect(s.useCase.execute(OWNER, 'вопрос')).resolves.toBe(TELEGRAM_FAILED_MESSAGE);

        expect(s.appendAgentAnswer).not.toHaveBeenCalled();
        expect(s.runs.size).toBe(0);
    });

    it('answers with the failure message when the answer cannot be stored', async () => {
        const s = setup({ failStore: true });

        await expect(s.useCase.execute(OWNER, 'вопрос')).resolves.toBe(TELEGRAM_FAILED_MESSAGE);
        expect(s.runs.size).toBe(0);
    });

    it('handles the next message normally after a failure', async () => {
        let call = 0;
        const s = setup({
            stream: () =>
                ++call === 1 ? emit(AgentEvent.runFailed('boom')) : emit(finished('Снова работаю')),
        });

        await expect(s.useCase.execute(OWNER, 'раз')).resolves.toBe(TELEGRAM_FAILED_MESSAGE);
        await expect(s.useCase.execute(OWNER, 'два')).resolves.toBe('Снова работаю');
    });

    it('releases the run and answers with the failure message when storing the question fails', async () => {
        const s = setup();
        s.appendUserMessage.mockRejectedValueOnce(new Error('db down'));

        await expect(s.useCase.execute(OWNER, 'вопрос')).resolves.toBe(TELEGRAM_FAILED_MESSAGE);

        expect(s.stream).not.toHaveBeenCalled();
        expect(s.runs.size).toBe(0);
    });

    it('rejects a message that is too long without starting the agent', async () => {
        const s = setup();

        await expect(s.useCase.execute(OWNER, 'я'.repeat(5000))).resolves.toBe(
            TELEGRAM_TOO_LONG_MESSAGE,
        );
        expect(s.stream).not.toHaveBeenCalled();
    });

    it('never reads the chats of the applications', async () => {
        const s = setup();

        await s.useCase.execute(OWNER, 'привет');

        expect(s.list).not.toHaveBeenCalled();
        expect(s.findOwned).not.toHaveBeenCalled();
        const [, , scope] = s.stream.mock.calls[0];
        expect(scope.client).toBe('telegram');
    });
});
