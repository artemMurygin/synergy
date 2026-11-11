import { describe, expect, it } from 'vitest';
import { InvalidRunInputError, MAX_QUESTION_LENGTH, RunInput } from './run-input';

describe('RunInput', () => {
    it('trims the question and keeps ids', () => {
        const input = RunInput.of({ threadId: 't1', runId: 'r1', question: '  Цены на МВА  ' });
        expect(input.question).toBe('Цены на МВА');
        expect(input.threadId).toBe('t1');
        expect(input.runId).toBe('r1');
    });

    it('accepts a question of exactly MAX_QUESTION_LENGTH after trim', () => {
        const input = RunInput.of({
            threadId: 't1',
            runId: 'r1',
            question: ` ${'a'.repeat(MAX_QUESTION_LENGTH)} `,
        });
        expect(input.question).toHaveLength(MAX_QUESTION_LENGTH);
    });

    it('rejects empty and whitespace-only questions', () => {
        expect(() => RunInput.of({ threadId: 't1', runId: 'r1', question: '' })).toThrow(
            InvalidRunInputError,
        );
        expect(() => RunInput.of({ threadId: 't1', runId: 'r1', question: '  \n ' })).toThrow(
            InvalidRunInputError,
        );
    });

    it('rejects a question longer than MAX_QUESTION_LENGTH', () => {
        expect(() =>
            RunInput.of({
                threadId: 't1',
                runId: 'r1',
                question: 'a'.repeat(MAX_QUESTION_LENGTH + 1),
            }),
        ).toThrow(InvalidRunInputError);
    });

    it('rejects an empty threadId', () => {
        expect(() => RunInput.of({ threadId: '  ', runId: 'r1', question: 'q' })).toThrow(
            InvalidRunInputError,
        );
        expect(() => RunInput.of({ threadId: '', runId: 'r1', question: 'q' })).toThrow(
            InvalidRunInputError,
        );
    });
});
