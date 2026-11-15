import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';
import { SKILL_STATUSES } from '../domain/skill-status';

export const REQUEST_ACCEPTED_EVENT_TYPE = 'portal.request_accepted';

export const requestAcceptedPayloadSchema = z.object({
    authorId: z.string().min(1),
    decidedBy: z.string().min(1),
    requestTitle: z.string().min(1),
    skillId: z.string().min(1),
    skillName: z.string().min(1),
    skillStatus: z.enum(SKILL_STATUSES),
    effortHours: z.number().int().positive().optional(),
});

export type RequestAcceptedPayload = z.infer<typeof requestAcceptedPayloadSchema>;

/** Заявка принята в навык; идентификатор агрегата равен идентификатору заявки. */
export class RequestAcceptedEvent extends DomainEvent {
    readonly authorId: string;

    readonly decidedBy: string;

    readonly requestTitle: string;

    readonly skillId: string;

    readonly skillName: string;

    readonly skillStatus: RequestAcceptedPayload['skillStatus'];

    readonly effortHours?: number;

    constructor(props: DomainEventProps<RequestAcceptedPayload>) {
        super(props);
        this.authorId = props.authorId;
        this.decidedBy = props.decidedBy;
        this.requestTitle = props.requestTitle;
        this.skillId = props.skillId;
        this.skillName = props.skillName;
        this.skillStatus = props.skillStatus;
        this.effortHours = props.effortHours;
    }

    get requestId(): string {
        return this.aggregateId;
    }
}
