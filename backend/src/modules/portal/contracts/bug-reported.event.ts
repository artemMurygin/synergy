import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const BUG_REPORTED_EVENT_TYPE = 'portal.bug_reported';

export const bugReportedPayloadSchema = z.object({
    bugId: z.string().min(1),
    authorId: z.string().min(1),
    title: z.string().min(1),
    productName: z.string().min(1),
    agentName: z.string().min(1),
});

export type BugReportedPayload = z.infer<typeof bugReportedPayloadSchema>;

/** Подан баг; идентификатор агрегата равен идентификатору бага. */
export class BugReportedEvent extends DomainEvent {
    readonly bugId: string;

    readonly authorId: string;

    readonly title: string;

    readonly productName: string;

    readonly agentName: string;

    constructor(props: DomainEventProps<BugReportedPayload>) {
        super(props);
        this.bugId = props.bugId;
        this.authorId = props.authorId;
        this.title = props.title;
        this.productName = props.productName;
        this.agentName = props.agentName;
    }
}
