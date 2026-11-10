import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const TASK_CREATED_EVENT_TYPE = 'tasks.task_created';

export const taskCreatedPayloadSchema = z.object({
    title: z.string().min(1),
    creatorId: z.string().min(1),
    assigneeId: z.string().min(1).nullable(),
});

export type TaskCreatedPayload = z.infer<typeof taskCreatedPayloadSchema>;

export class TaskCreatedEvent extends DomainEvent {
    readonly title: string;

    readonly creatorId: string;

    readonly assigneeId: string | null;

    constructor(props: DomainEventProps<TaskCreatedPayload>) {
        super(props);
        this.title = props.title;
        this.creatorId = props.creatorId;
        this.assigneeId = props.assigneeId;
    }

    get taskId(): string {
        return this.aggregateId;
    }
}
