import { describe, expect, it } from 'vitest';
import { InvalidTaskSortError, TaskSort } from './task-sort';

describe('TaskSort', () => {
    it('defaults to createdAt descending', () => {
        const sort = TaskSort.of({});
        expect(sort.field).toBe('createdAt');
        expect(sort.direction).toBe('desc');
        expect(TaskSort.default()).toEqual(sort);
    });

    it('accepts every whitelisted field and both directions', () => {
        for (const field of ['deadline', 'createdAt', 'updatedAt']) {
            for (const direction of ['asc', 'desc']) {
                const sort = TaskSort.of({ field, direction });
                expect(sort.field).toBe(field);
                expect(sort.direction).toBe(direction);
            }
        }
    });

    it('defaults the direction to desc when only the field is given', () => {
        expect(TaskSort.of({ field: 'deadline' }).direction).toBe('desc');
    });

    it('rejects a field outside the whitelist', () => {
        expect(() => TaskSort.of({ field: 'title' })).toThrow(InvalidTaskSortError);
        expect(() => TaskSort.of({ field: 'created_at; DROP TABLE task' })).toThrow(
            InvalidTaskSortError,
        );
    });

    it('rejects an unknown direction', () => {
        expect(() => TaskSort.of({ direction: 'up' })).toThrow(InvalidTaskSortError);
    });
});
