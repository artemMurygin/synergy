import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const REQUEST_TAKEN_EVENT_TYPE = 'portal.request_taken';

export const requestTakenPayloadSchema = z.object({
    authorId: z.string().min(1),
    reviewerId: z.string().min(1),
    requestTitle: z.string().min(1),
});

export type RequestTakenPayload = z.infer<typeof requestTakenPayloadSchema>;

/** Заявка взята в работу; идентификатор агрегата равен идентификатору заявки. */
export class RequestTakenEvent extends DomainEvent {
    readonly authorId: string;

    readonly reviewerId: string;

    readonly requestTitle: string;

    constructor(props: DomainEventProps<RequestTakenPayload>) {
        super(props);
        this.authorId = props.authorId;
        this.reviewerId = props.reviewerId;
        this.requestTitle = props.requestTitle;
    }

    get requestId(): string {
        return this.aggregateId;
    }
}
