import { describe, expect, it } from 'vitest';
import {
    AttachmentLimitReachedError,
    AttachmentNotFoundError,
    AttachmentTooLargeError,
    TaskErrorCode,
    TaskNotFoundError,
    TaskUserNotFoundError,
} from './errors';

describe('task domain errors', () => {
    it('carry stable codes', () => {
        expect(TaskErrorCode).toEqual({
            TaskNotFound: 'TASK_NOT_FOUND',
            AttachmentNotFound: 'TASK_ATTACHMENT_NOT_FOUND',
            UserNotFound: 'TASK_USER_NOT_FOUND',
            AttachmentLimit: 'TASK_ATTACHMENT_LIMIT',
            AttachmentTooLarge: 'TASK_ATTACHMENT_TOO_LARGE',
        });
        expect(new TaskNotFoundError('t1').code).toBe('TASK_NOT_FOUND');
        expect(new AttachmentNotFoundError('a1').code).toBe('TASK_ATTACHMENT_NOT_FOUND');
        expect(new TaskUserNotFoundError(['u1']).code).toBe('TASK_USER_NOT_FOUND');
        expect(new AttachmentLimitReachedError(10).code).toBe('TASK_ATTACHMENT_LIMIT');
        expect(new AttachmentTooLargeError(1024).code).toBe('TASK_ATTACHMENT_TOO_LARGE');
    });

    it('expose the offending data', () => {
        expect(new TaskUserNotFoundError(['u1', 'u2']).userIds).toEqual(['u1', 'u2']);
        expect(new AttachmentLimitReachedError(10).limit).toBe(10);
        expect(new AttachmentTooLargeError(1024).maxBytes).toBe(1024);
    });
});
