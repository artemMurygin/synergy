import type { NotificationContent } from './notification-content';
import type { NotificationTarget } from './notification-target';
import type { NotificationType } from './notification-type';

export interface NotificationDraft {
    readonly recipientId: string;
    readonly type: NotificationType;
    readonly content: NotificationContent;
    readonly target: NotificationTarget;
    readonly actorId: string | null;
}
