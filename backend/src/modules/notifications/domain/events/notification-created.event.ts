import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../../shared/ddd';

export const NOTIFICATION_CREATED_EVENT_TYPE = 'notifications.notification_created';

export const notificationCreatedPayloadSchema = z.object({
    recipientId: z.string().min(1),
});

export type NotificationCreatedPayload = z.infer<typeof notificationCreatedPayloadSchema>;

export class NotificationCreatedEvent extends DomainEvent {
    readonly recipientId: string;

    constructor(props: DomainEventProps<NotificationCreatedPayload>) {
        super(props);
        this.recipientId = props.recipientId;
    }

    get notificationId(): string {
        return this.aggregateId;
    }
}
