import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../../shared/ddd';
import { FILE_KINDS } from '../file-kind';

export const FILE_UPLOADED_EVENT_TYPE = 'file.uploaded';

/** Без имени и содержимого файла. */
export const fileUploadedPayloadSchema = z.object({
    ownerId: z.string().min(1),
    kind: z.enum(FILE_KINDS),
    mediaType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
});

export type FileUploadedPayload = z.infer<typeof fileUploadedPayloadSchema>;

export class FileUploadedEvent extends DomainEvent {
    readonly ownerId: string;

    readonly kind: FileUploadedPayload['kind'];

    readonly mediaType: string;

    readonly sizeBytes: number;

    constructor(props: DomainEventProps<FileUploadedPayload>) {
        super(props);
        this.ownerId = props.ownerId;
        this.kind = props.kind;
        this.mediaType = props.mediaType;
        this.sizeBytes = props.sizeBytes;
    }

    get fileId(): string {
        return this.aggregateId;
    }
}
