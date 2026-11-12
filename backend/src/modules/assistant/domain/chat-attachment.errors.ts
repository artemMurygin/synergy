import { BaseError } from '../../../shared/errors';

export const ChatAttachmentErrorCode = {
    NotFound: 'CHAT_ATTACHMENT_NOT_FOUND',
    Expired: 'CHAT_ATTACHMENT_EXPIRED',
} as const;

/** The attached file does not exist or belongs to another user: the answer is the same. */
export class ChatAttachmentNotFoundError extends BaseError {
    readonly code = ChatAttachmentErrorCode.NotFound;

    constructor(readonly fileId: string) {
        super(`File ${fileId} not found`);
    }
}

/** The attached file is deleted: its retention period is over. */
export class ChatAttachmentExpiredError extends BaseError {
    readonly code = ChatAttachmentErrorCode.Expired;

    constructor(readonly fileId: string) {
        super(`Срок хранения файла истёк: ${fileId}`);
    }
}
