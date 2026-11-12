import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../../shared/ddd';
import { FILE_KINDS } from '../file-kind';

export const FILE_DELETED_EVENT_TYPE = 'file.deleted';

export const FILE_DELETION_CAUSES = ['owner', 'retention'] as const;

export type FileDeletionCause = (typeof FILE_DELETION_CAUSES)[number];

export const fileDeletedPayloadSchema = z.object({
    ownerId: z.string().min(1),
    kind: z.enum(FILE_KINDS),
    cause: z.enum(FILE_DELETION_CAUSES),
});

export type FileDeletedPayload = z.infer<typeof fileDeletedPayloadSchema>;

export class FileDeletedEvent extends DomainEvent {
    readonly ownerId: string;

    readonly kind: FileDeletedPayload['kind'];

    readonly cause: FileDeletionCause;

    constructor(props: DomainEventProps<FileDeletedPayload>) {
        super(props);
        this.ownerId = props.ownerId;
        this.kind = props.kind;
        this.cause = props.cause;
    }

    get fileId(): string {
        return this.aggregateId;
    }
}
