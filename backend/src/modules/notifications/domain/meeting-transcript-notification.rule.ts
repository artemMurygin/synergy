import type { ChatSystemMessagePostedEvent } from '../../assistant/contracts/chat-system-message-posted.event';
import { MAX_NOTIFICATION_TITLE_LENGTH, NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';
import type { NotificationType } from './notification-type';

const ELLIPSIS = '…';

const TITLES: Record<ChatSystemMessagePostedEvent['topic'], string> = {
    'meeting-transcript.ready': 'Расшифровка готова',
    'meeting-transcript.failed': 'Не удалось расшифровать запись',
};

function titleOf(event: ChatSystemMessagePostedEvent): string {
    const title = `${TITLES[event.topic]}: ${event.subject.fileName}`;
    return title.length <= MAX_NOTIFICATION_TITLE_LENGTH
        ? title
        : `${title.slice(0, MAX_NOTIFICATION_TITLE_LENGTH - ELLIPSIS.length)}${ELLIPSIS}`;
}

export class MeetingTranscriptNotificationRule {
    apply(event: ChatSystemMessagePostedEvent): NotificationDraft[] {
        const type: NotificationType = event.topic;
        return [
            {
                recipientId: event.ownerId,
                type,
                content: NotificationContent.of({
                    title: titleOf(event),
                    body: event.subject.fileName,
                }),
                target: NotificationTarget.of({ type: 'chat', id: event.sessionId }),
                actorId: null,
            },
        ];
    }
}
