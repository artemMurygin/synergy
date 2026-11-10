import type { NotificationType } from '../../domain/notification-type';

export abstract class NotificationCreationMetricsPort {
    abstract recordCreated(type: NotificationType): void;
}
