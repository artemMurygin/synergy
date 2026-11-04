import { describe, expect, it, vi } from 'vitest';
import type { SheetsAssistantPort } from '../domain/ports/sheets-assistant.port';
import {
    AskQuestionUseCase,
    InvalidQuestionError,
    MAX_QUESTION_LENGTH,
} from './ask-question.use-case';

function setup(): { useCase: AskQuestionUseCase; ask: ReturnType<typeof vi.fn> } {
    const ask = vi.fn().mockResolvedValue({ answer: 'ok', toolCalls: [], durationMs: 1 });
    const assistant = { ask } as unknown as SheetsAssistantPort;
    return { useCase: new AskQuestionUseCase(assistant), ask };
}

describe('AskQuestionUseCase', () => {
    it('passes the trimmed question to the assistant', async () => {
        const { useCase, ask } = setup();
        await expect(useCase.execute('  Сколько стоит?  ', 's1')).resolves.toMatchObject({
            answer: 'ok',
        });
        expect(ask).toHaveBeenCalledWith('Сколько стоит?', 's1');
    });

    it('rejects an empty question', async () => {
        const { useCase, ask } = setup();
        await expect(useCase.execute('   ', 's1')).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(ask).not.toHaveBeenCalled();
    });

    it('rejects an empty session id', async () => {
        const { useCase, ask } = setup();
        await expect(useCase.execute('Вопрос', ' ')).rejects.toBeInstanceOf(InvalidQuestionError);
        expect(ask).not.toHaveBeenCalled();
    });

    it('rejects a too long question', async () => {
        const { useCase } = setup();
        await expect(
            useCase.execute('я'.repeat(MAX_QUESTION_LENGTH + 1), 's1'),
        ).rejects.toBeInstanceOf(InvalidQuestionError);
    });
});
