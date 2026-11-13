import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';
import { SKILL_STATUSES } from '../domain/skill-status';
import { linkedRequestSnapshotSchema, type LinkedRequestSnapshot } from './linked-request-snapshot';

export const SKILL_STATUS_CHANGED_EVENT_TYPE = 'portal.skill_status_changed';

export const skillStatusChangedPayloadSchema = z.object({
    skillName: z.string().min(1),
    from: z.enum(SKILL_STATUSES),
    to: z.enum(SKILL_STATUSES),
    changedBy: z.string().min(1),
    linked: z.array(linkedRequestSnapshotSchema),
});

export type SkillStatusChangedPayload = z.infer<typeof skillStatusChangedPayloadSchema>;

/** Статус навыка изменён; идентификатор агрегата равен идентификатору навыка. */
export class SkillStatusChangedEvent extends DomainEvent {
    readonly skillName: string;

    readonly from: SkillStatusChangedPayload['from'];

    readonly to: SkillStatusChangedPayload['to'];

    readonly changedBy: string;

    readonly linked: readonly LinkedRequestSnapshot[];

    constructor(props: DomainEventProps<SkillStatusChangedPayload>) {
        super(props);
        this.skillName = props.skillName;
        this.from = props.from;
        this.to = props.to;
        this.changedBy = props.changedBy;
        this.linked = props.linked;
    }

    get skillId(): string {
        return this.aggregateId;
    }
}
