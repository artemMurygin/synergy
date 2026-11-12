import { ATTACHMENT_KINDS, type AttachmentKind } from '../../../shared/agent-capability';

export const ATTACHMENT_FILE_STATUSES = ['active', 'deleted'] as const;

export type AttachmentFileStatus = (typeof ATTACHMENT_FILE_STATUSES)[number];

export interface MessageAttachmentProps {
    readonly fileId: string;
    /** Order of the file in the message, from 0. */
    readonly position: number;
    readonly name: string;
    readonly mediaType: string;
    readonly kind: AttachmentKind;
    readonly sizeBytes: number;
    /** The current status of the stored file, read on every history request. */
    readonly status: AttachmentFileStatus;
}

export class InvalidMessageAttachmentError extends Error {}

/** A file attached to a message of the history; a deleted file stays with its name and size. */
export class MessageAttachment {
    readonly fileId: string;
    readonly position: number;
    readonly name: string;
    readonly mediaType: string;
    readonly kind: AttachmentKind;
    readonly sizeBytes: number;
    readonly status: AttachmentFileStatus;

    private constructor(props: MessageAttachmentProps) {
        this.fileId = props.fileId;
        this.position = props.position;
        this.name = props.name;
        this.mediaType = props.mediaType;
        this.kind = props.kind;
        this.sizeBytes = props.sizeBytes;
        this.status = props.status;
        Object.freeze(this);
    }

    static of(props: MessageAttachmentProps): MessageAttachment {
        if (props.fileId.trim() === '') {
            throw new InvalidMessageAttachmentError('Attachment fileId is empty');
        }
        if (!Number.isInteger(props.position) || props.position < 0) {
            throw new InvalidMessageAttachmentError('Attachment position must be >= 0');
        }
        if (!(ATTACHMENT_KINDS as readonly string[]).includes(props.kind)) {
            throw new InvalidMessageAttachmentError(`Unknown attachment kind ${props.kind}`);
        }
        if (!(ATTACHMENT_FILE_STATUSES as readonly string[]).includes(props.status)) {
            throw new InvalidMessageAttachmentError(`Unknown attachment status ${props.status}`);
        }
        return new MessageAttachment(props);
    }
}
