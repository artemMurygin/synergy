import { describe, expect, it, vi } from 'vitest';
import { ChatSession } from '../domain/chat-session';
import { ChatSessionNotFoundError } from '../domain/chat-session-not-found.error';
import { ChatTitle } from '../domain/chat-title';
import type { ChatSessionRepositoryPort } from '../domain/ports/chat-session-repository.port';
import type { ChatThreadPort } from '../domain/ports/chat-thread.port';
import type { SheetsAssistantPort } from '../domain/ports/sheets-assistant.port';
import {
    AskQuestionUseCase,
    InvalidQuestionError,
    MAX_QUESTION_LENGTH,
} from './ask-question.use-case';

const ANSWER = { answer: 'ok', toolCalls: [], durationMs: 1 };

function setup(session: ChatSession | null = ChatSession.create()): {
    useCase: AskQuestionUseCase;
    ask: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    appendUserMessage: ReturnType<typeof vi.fn>;
    appendAgentAnswer: ReturnType<typeof vi.fn>;
    calls: string[];
    deleteThread: ReturnType<typeof vi.fn>;
} {
    const calls: string[] = [];
    const ask = vi.fn(() => {
        calls.push('ask');
        return Promise.resolve(ANSWER);
    });
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
    const deleteThread = vi.fn().mockResolvedValue(undefined);
    const threads = { deleteThread } as unknown as ChatThreadPort;
    const assistant = { ask } as unknown as SheetsAssistantPort;
    return {
        useCase: new AskQuestionUseCase(assistant, sessions, threads),
        ask,
        findById,
        appendUserMessage,
        appendAgentAnswer,
        calls,
        deleteThread,
    };
}

describe('AskQuestionUseCase', () => {
    it('passes the trimmed question to the assistant', async () => {
        const { useCase, ask } = setup();
        await expect(useCase.execute('  Сколько стоит?  ', 's1')).resolves.toMatchObject({
            answer: 'ok',
        });
        expect(ask).toHaveBeenCalledWith('Сколько стоит?', 's1');
    });

    it('checks the session, stores the question, asks, then stores the answer', async () => {
        const { useCase, calls, appendUserMessage, appendAgentAnswer } = setup();
        await useCase.execute('Вопрос', 's1');
        expect(calls).toEqual(['find', 'appendUser', 'ask', 'appendAgent']);
        expect(appendUserMessage).toHaveBeenCalledWith('s1', 'Вопрос');
        expect(appendAgentAnswer).toHaveBeenCalledWith('s1', ANSWER, expect.anything());
    });

    it('fails with not found for an unknown session, without agent call or writes', async () => {
        const { useCase, ask, appendUserMessage, appendAgentAnswer } = setup(null);
        await expect(useCase.execute('Вопрос', 's1')).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        expect(ask).not.toHaveBeenCalled();
        expect(appendUserMessage).not.toHaveBeenCalled();
        expect(appendAgentAnswer).not.toHaveBeenCalled();
    });

    it('keeps the question and writes no answer when the agent fails', async () => {
        const { useCase, ask, appendUserMessage, appendAgentAnswer } = setup();
        ask.mockRejectedValueOnce(new Error('timeout'));
        await expect(useCase.execute('Вопрос', 's1')).rejects.toThrow('timeout');
        expect(appendUserMessage).toHaveBeenCalledOnce();
        expect(appendAgentAnswer).not.toHaveBeenCalled();
    });

    it('proposes an auto title from the question for a default-titled chat', async () => {
        const { useCase, appendAgentAnswer } = setup();
        await useCase.execute('  Сколько стоит МВА? ', 's1');
        const title = (appendAgentAnswer.mock.calls[0] as unknown[])[2] as ChatTitle;
        expect(title.value).toBe('Сколько стоит МВА?');
    });

    it('does not propose an auto title when the title is custom', async () => {
        const { useCase, appendAgentAnswer } = setup(ChatSession.create(ChatTitle.of('Цены')));
        await useCase.execute('Вопрос', 's1');
        expect((appendAgentAnswer.mock.calls[0] as unknown[])[2]).toBeUndefined();
    });

    it('rejects an empty question', async () => {
        const { useCase, ask, findById } = setup();
        await expect(useCase.execute('   ', 's1')).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(ask).not.toHaveBeenCalled();
        expect(findById).not.toHaveBeenCalled();
    });

    it('rejects an empty session id', async () => {
        const { useCase, ask } = setup();
        await expect(useCase.execute('Вопрос', ' ')).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(ask).not.toHaveBeenCalled();
    });

    it('rejects a too long question', async () => {
        const { useCase, appendUserMessage } = setup();
        await expect(
            useCase.execute('я'.repeat(MAX_QUESTION_LENGTH + 1), 's1'),
        ).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(appendUserMessage).not.toHaveBeenCalled();
    });

    it('clears the agent thread when the session was deleted while the agent worked', async () => {
        const { useCase, appendAgentAnswer, deleteThread, findById } = setup();
        findById.mockResolvedValueOnce(ChatSession.create()).mockResolvedValueOnce(null);
        appendAgentAnswer.mockRejectedValueOnce(new ChatSessionNotFoundError('s1'));
        await expect(useCase.execute('Вопрос', 's1')).rejects.toBeInstanceOf(
            ChatSessionNotFoundError,
        );
        expect(deleteThread).toHaveBeenCalledWith('s1');
    });

    it('does not touch the thread when the answer is stored normally', async () => {
        const { useCase, deleteThread } = setup();
        await useCase.execute('Вопрос', 's1');
        expect(deleteThread).not.toHaveBeenCalled();
    });

    it('does not touch the thread when the agent fails and the session still exists', async () => {
        const { useCase, ask, deleteThread } = setup();
        ask.mockRejectedValueOnce(new Error('boom'));
        await expect(useCase.execute('Вопрос', 's1')).rejects.toThrow('boom');
        expect(deleteThread).not.toHaveBeenCalled();
    });
});
