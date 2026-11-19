import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../shared/http/error-status.registry';
import { TASK_ACCESS_DENIED } from '../domain/access-denied.error';
import { TaskErrorCode } from '../domain/errors';

export function registerTaskErrorStatuses(): void {
    registerErrorStatuses({
        [TaskErrorCode.TaskNotFound]: HttpStatus.NOT_FOUND,
        [TaskErrorCode.AttachmentNotFound]: HttpStatus.NOT_FOUND,
        [TaskErrorCode.UserNotFound]: HttpStatus.UNPROCESSABLE_ENTITY,
        [TaskErrorCode.AttachmentLimit]: HttpStatus.UNPROCESSABLE_ENTITY,
        [TaskErrorCode.AttachmentTooLarge]: HttpStatus.PAYLOAD_TOO_LARGE,
        [TaskErrorCode.AttachmentLinksUnavailable]: HttpStatus.SERVICE_UNAVAILABLE,
        [TaskErrorCode.AttachmentTokenInvalid]: HttpStatus.FORBIDDEN,
        [TASK_ACCESS_DENIED]: HttpStatus.FORBIDDEN,
    });
}
