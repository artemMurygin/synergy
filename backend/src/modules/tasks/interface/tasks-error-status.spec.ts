import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { findErrorStatus } from '../../../shared/http/error-status.registry';
import { TASK_ACCESS_DENIED } from '../domain/access-denied.error';
import { TaskErrorCode } from '../domain/errors';
import { registerTaskErrorStatuses } from './tasks-error-status';

describe('registerTaskErrorStatuses', () => {
    it('maps every task error code to its HTTP status', () => {
        registerTaskErrorStatuses();

        expect(findErrorStatus(TaskErrorCode.TaskNotFound)).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus(TaskErrorCode.AttachmentNotFound)).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus(TaskErrorCode.UserNotFound)).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(findErrorStatus(TaskErrorCode.AttachmentLimit)).toBe(
            HttpStatus.UNPROCESSABLE_ENTITY,
        );
        expect(findErrorStatus(TaskErrorCode.AttachmentTooLarge)).toBe(
            HttpStatus.PAYLOAD_TOO_LARGE,
        );
        expect(findErrorStatus(TASK_ACCESS_DENIED)).toBe(HttpStatus.FORBIDDEN);
    });
});
