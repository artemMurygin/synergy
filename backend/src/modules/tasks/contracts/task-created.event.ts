import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../shared/ddd';

export const TASK_CREATED_EVENT_TYPE = 'tasks.task_created';

export const taskCreatedPayloadSchema = z.object({
    title: z.string().min(1),
    creatorId: z.string().min(1),
    /** Нет в событиях, записанных до появления инициатора: тогда он равен создателю. */
    initiatorId: z.string().min(1).optional(),
    assigneeId: z.string().min(1).nullable(),
});

export type TaskCreatedPayload = z.infer<typeof taskCreatedPayloadSchema>;

export class TaskCreatedEvent extends DomainEvent {
    readonly title: string;

    readonly creatorId: string;

    /** Кто фактически создал задачу; отличается от `creatorId`, если агент поставил её от чужого имени. */
    readonly initiatorId: string;

    readonly assigneeId: string | null;

    constructor(props: DomainEventProps<TaskCreatedPayload>) {
        super(props);
        this.title = props.title;
        this.creatorId = props.creatorId;
        this.initiatorId = props.initiatorId ?? props.creatorId;
        this.assigneeId = props.assigneeId;
    }

    get taskId(): string {
        return this.aggregateId;
    }
}
