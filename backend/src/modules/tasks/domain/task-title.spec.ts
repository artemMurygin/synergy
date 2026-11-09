import { describe, expect, it } from 'vitest';
import { MAX_TASK_TITLE_LENGTH, InvalidTaskTitleError, TaskTitle } from './task-title';

describe('TaskTitle', () => {
    it('trims surrounding whitespace', () => {
        expect(TaskTitle.of('  Подготовить отчёт \n').value).toBe('Подготовить отчёт');
    });

    it('rejects an empty or blank title', () => {
        expect(() => TaskTitle.of('')).toThrow(InvalidTaskTitleError);
        expect(() => TaskTitle.of('   \t ')).toThrow(InvalidTaskTitleError);
    });

    it('accepts exactly 200 characters and rejects 201', () => {
        expect(TaskTitle.of('a'.repeat(MAX_TASK_TITLE_LENGTH)).value).toHaveLength(200);
        expect(() => TaskTitle.of('a'.repeat(MAX_TASK_TITLE_LENGTH + 1))).toThrow(
            InvalidTaskTitleError,
        );
    });

    it('measures the length after trimming', () => {
        expect(TaskTitle.of(` ${'a'.repeat(200)} `).value).toHaveLength(200);
    });

    it('compares by value', () => {
        expect(TaskTitle.of(' a ').equals(TaskTitle.of('a'))).toBe(true);
        expect(TaskTitle.of('a').equals(TaskTitle.of('b'))).toBe(false);
    });
});
