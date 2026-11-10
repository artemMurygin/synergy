import { RequestContext } from '../../../shared/context/request-context';
import { AggregateRoot } from '../../../shared/ddd';
import { InvalidNotificationStateError } from './errors';
import { NotificationCreatedEvent } from './events/notification-created.event';
import type { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import type { NotificationTarget } from './notification-target';
import type { NotificationType } from './notification-type';

export interface NotificationProps {
    readonly recipientId: string;
    readonly type: NotificationType;
    readonly content: NotificationContent;
    readonly target: NotificationTarget;
    readonly actorId: string | null;
    readonly sourceEventId: string;
    readAt: Date | null;
}

export interface CreateNotificationInput {
    readonly id: string;
    readonly draft: NotificationDraft;
    readonly sourceEventId: string;
    readonly now: Date;
}

export interface RestoreNotificationInput extends NotificationProps {
    readonly id: string;
    readonly createdAt: Date;
}

export class Notification extends AggregateRoot<NotificationProps> {
    static create({ id, draft, sourceEventId, now }: CreateNotificationInput): Notification {
        const notification = new Notification({
            id,
            createdAt: now,
            updatedAt: now,
            props: {
                recipientId: draft.recipientId,
                type: draft.type,
                content: draft.content,
                target: draft.target,
                actorId: draft.actorId,
                sourceEventId,
                readAt: null,
            },
        });
        notification.addEvent(
            new NotificationCreatedEvent({
                aggregateId: id,
                recipientId: draft.recipientId,
                metadata: {
                    timestamp: now.getTime(),
                    correlationId: RequestContext.getCorrelationId(),
                    causationId: sourceEventId,
                },
            }),
        );
        return notification;
    }

    static restore({ id, createdAt, ...props }: RestoreNotificationInput): Notification {
        return new Notification({
            id,
            createdAt,
            updatedAt: props.readAt ?? createdAt,
            props: { ...props },
        });
    }

    get recipientId(): string {
        return this.props.recipientId;
    }

    get type(): NotificationType {
        return this.props.type;
    }

    get content(): NotificationContent {
        return this.props.content;
    }

    get target(): NotificationTarget {
        return this.props.target;
    }

    get actorId(): string | null {
        return this.props.actorId;
    }

    get sourceEventId(): string {
        return this.props.sourceEventId;
    }

    get readAt(): Date | null {
        return this.props.readAt;
    }

    isRead(): boolean {
        return this.props.readAt !== null;
    }

    markAsRead(now: Date): boolean {
        if (this.props.readAt !== null) return false;
        this.props.readAt = now < this.createdAt ? this.createdAt : now;
        this.touch();
        return true;
    }

    validate(): void {
        if (this.props.readAt !== null && this.props.readAt < this.createdAt) {
            throw new InvalidNotificationStateError(
                'Notification cannot be read before it was created',
            );
        }
    }
}
