import { describe, expect, it } from 'vitest';
import { InvalidTaskFilterError, TaskFilter } from './task-filter';

describe('TaskFilter', () => {
    it('is empty by default', () => {
        expect(TaskFilter.of({})).toMatchObject({});
        expect(TaskFilter.of({}).status).toBeUndefined();
        expect(TaskFilter.of({}).overdue).toBeUndefined();
    });

    it('keeps all conditions', () => {
        const filter = TaskFilter.of({
            status: 'in_progress',
            creatorId: 'u1',
            assigneeId: 'u2',
            watcherId: 'u3',
            overdue: true,
            titleContains: 'отчёт',
        });
        expect(filter.status).toBe('in_progress');
        expect(filter.creatorId).toBe('u1');
        expect(filter.assigneeId).toBe('u2');
        expect(filter.watcherId).toBe('u3');
        expect(filter.overdue).toBe(true);
        expect(filter.titleContains).toBe('отчёт');
    });

    it('rejects an unknown status', () => {
        expect(() => TaskFilter.of({ status: 'blocked' })).toThrow(InvalidTaskFilterError);
    });

    it('trims the substring and drops a blank one', () => {
        expect(TaskFilter.of({ titleContains: '  abc ' }).titleContains).toBe('abc');
        expect(TaskFilter.of({ titleContains: '   ' }).titleContains).toBeUndefined();
    });

    it('is immutable', () => {
        const filter = TaskFilter.of({ status: 'done' });
        expect(Object.isFrozen(filter)).toBe(true);
    });
});
