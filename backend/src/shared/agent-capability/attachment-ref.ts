import { ArgumentInvalidError } from '../errors';

export const ATTACHMENT_KINDS = ['recording', 'document'] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export interface AttachmentRefProps {
    readonly fileId: string;
    readonly name: string;
    readonly mediaType: string;
    readonly kind: AttachmentKind;
    readonly sizeBytes: number;
}

function requireText(value: string, field: string): string {
    if (value.trim() === '') throw new ArgumentInvalidError(`AttachmentRef ${field} is empty`);
    return value;
}

/**
 * A checked file of the user in a chat message: an attachment of the question or a file the agent
 * created during the run. Shared by the assistant and by capabilities that issue files.
 */
export class AttachmentRef {
    readonly fileId: string;
    readonly name: string;
    readonly mediaType: string;
    readonly kind: AttachmentKind;
    readonly sizeBytes: number;

    private constructor(props: AttachmentRefProps) {
        this.fileId = props.fileId;
        this.name = props.name;
        this.mediaType = props.mediaType;
        this.kind = props.kind;
        this.sizeBytes = props.sizeBytes;
        Object.freeze(this);
    }

    static of(props: AttachmentRefProps): AttachmentRef {
        requireText(props.fileId, 'fileId');
        requireText(props.name, 'name');
        requireText(props.mediaType, 'mediaType');
        if (!(ATTACHMENT_KINDS as readonly string[]).includes(props.kind)) {
            throw new ArgumentInvalidError(`AttachmentRef kind ${props.kind} is unknown`);
        }
        if (!Number.isInteger(props.sizeBytes) || props.sizeBytes < 0) {
            throw new ArgumentInvalidError(
                'AttachmentRef sizeBytes must be a non-negative integer',
            );
        }
        return new AttachmentRef(props);
    }
}
