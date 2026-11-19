import { BaseError } from '../../../shared/errors';

export const TaskErrorCode = {
    TaskNotFound: 'TASK_NOT_FOUND',
    AttachmentNotFound: 'TASK_ATTACHMENT_NOT_FOUND',
    UserNotFound: 'TASK_USER_NOT_FOUND',
    AttachmentLimit: 'TASK_ATTACHMENT_LIMIT',
    AttachmentTooLarge: 'TASK_ATTACHMENT_TOO_LARGE',
    AttachmentLinksUnavailable: 'TASK_ATTACHMENT_LINKS_UNAVAILABLE',
    AttachmentTokenInvalid: 'TASK_ATTACHMENT_TOKEN_INVALID',
} as const;

export class TaskNotFoundError extends BaseError {
    readonly code = TaskErrorCode.TaskNotFound;

    constructor(readonly taskId: string) {
        super(`Task ${taskId} not found`);
    }
}

export class AttachmentNotFoundError extends BaseError {
    readonly code = TaskErrorCode.AttachmentNotFound;

    constructor(readonly attachmentId: string) {
        super(`Attachment ${attachmentId} not found`);
    }
}

export class TaskUserNotFoundError extends BaseError {
    readonly code = TaskErrorCode.UserNotFound;

    constructor(readonly userIds: readonly string[]) {
        super('Some users do not exist or are inactive');
    }
}

export class AttachmentLimitReachedError extends BaseError {
    readonly code = TaskErrorCode.AttachmentLimit;

    constructor(readonly limit: number) {
        super(`A task cannot have more than ${String(limit)} attachments`);
    }
}

export class AttachmentTooLargeError extends BaseError {
    readonly code = TaskErrorCode.AttachmentTooLarge;

    constructor(readonly maxBytes: number) {
        super(`File is larger than ${String(maxBytes)} bytes`);
    }
}

/** Секрет ссылок не задан: выдача ссылок выключена. */
export class TaskAttachmentLinksUnavailableError extends BaseError {
    readonly code = TaskErrorCode.AttachmentLinksUnavailable;

    constructor() {
        super('Attachment download links are not configured');
    }
}

export class TaskAttachmentTokenInvalidError extends BaseError {
    readonly code = TaskErrorCode.AttachmentTokenInvalid;

    constructor() {
        super('Attachment download token is invalid');
    }
}
