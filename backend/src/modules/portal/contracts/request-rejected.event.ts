import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const REQUEST_REJECTED_EVENT_TYPE = 'portal.request_rejected';

export const requestRejectedPayloadSchema = z.object({
    authorId: z.string().min(1),
    decidedBy: z.string().min(1),
    reason: z.string().min(1),
    requestTitle: z.string().min(1),
});

export type RequestRejectedPayload = z.infer<typeof requestRejectedPayloadSchema>;

/** Заявка отклонена с причиной; идентификатор агрегата равен идентификатору заявки. */
export class RequestRejectedEvent extends DomainEvent {
    readonly authorId: string;

    readonly decidedBy: string;

    readonly reason: string;

    readonly requestTitle: string;

    constructor(props: DomainEventProps<RequestRejectedPayload>) {
        super(props);
        this.authorId = props.authorId;
        this.decidedBy = props.decidedBy;
        this.reason = props.reason;
        this.requestTitle = props.requestTitle;
    }

    get requestId(): string {
        return this.aggregateId;
    }
}
