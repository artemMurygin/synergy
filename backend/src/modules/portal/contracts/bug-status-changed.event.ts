import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';
import { BUG_STATUSES } from '../domain/bug-status';

export const BUG_STATUS_CHANGED_EVENT_TYPE = 'portal.bug_status_changed';

export const bugStatusChangedPayloadSchema = z.object({
    bugId: z.string().min(1),
    authorId: z.string().min(1),
    changedBy: z.string().min(1),
    title: z.string().min(1),
    from: z.enum(BUG_STATUSES),
    to: z.enum(BUG_STATUSES),
    reason: z.string().min(1).nullable(),
});

export type BugStatusChangedPayload = z.infer<typeof bugStatusChangedPayloadSchema>;

/** Сменён статус бага; идентификатор агрегата равен идентификатору бага. */
export class BugStatusChangedEvent extends DomainEvent {
    readonly bugId: string;

    readonly authorId: string;

    readonly changedBy: string;

    readonly title: string;

    readonly from: BugStatusChangedPayload['from'];

    readonly to: BugStatusChangedPayload['to'];

    readonly reason: string | null;

    constructor(props: DomainEventProps<BugStatusChangedPayload>) {
        super(props);
        this.bugId = props.bugId;
        this.authorId = props.authorId;
        this.changedBy = props.changedBy;
        this.title = props.title;
        this.from = props.from;
        this.to = props.to;
        this.reason = props.reason;
    }
}
