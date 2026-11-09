import { describe, expect, it } from 'vitest';
import { InvalidTaskStatusError, TASK_STATUSES, TaskStatus } from './task-status';

describe('TaskStatus', () => {
    it('knows exactly three statuses', () => {
        expect([...TASK_STATUSES]).toEqual(['todo', 'in_progress', 'done']);
    });

    it('parses each known status', () => {
        expect(TaskStatus.parse('todo')).toBe('todo');
        expect(TaskStatus.parse('in_progress')).toBe('in_progress');
        expect(TaskStatus.parse('done')).toBe('done');
    });

    it('rejects an unknown status', () => {
        expect(() => TaskStatus.parse('blocked')).toThrow(InvalidTaskStatusError);
        expect(() => TaskStatus.parse('')).toThrow(InvalidTaskStatusError);
        expect(() => TaskStatus.parse('DONE')).toThrow(InvalidTaskStatusError);
    });
});
