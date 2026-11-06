import { describe, expect, it } from 'vitest';
import { RunConflictError } from './run-conflict.error';

describe('RunConflictError', () => {
    it('carries the thread id', () => {
        const error = new RunConflictError('t1');
        expect(error).toBeInstanceOf(Error);
        expect(error.threadId).toBe('t1');
        expect(error.message).toContain('t1');
    });
});
