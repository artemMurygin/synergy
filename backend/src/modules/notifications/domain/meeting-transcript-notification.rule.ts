import type { ChatSystemMessagePostedEvent } from '../../assistant/contracts/chat-system-message-posted.event';
import { NotificationContent } from './notification-content';
import type { NotificationDraft } from './notification-draft';
import { NotificationTarget } from './notification-target';
import type { NotificationType } from './notification-type';

const TITLES: Record<ChatSystemMessagePostedEvent['topic'], string> = {
    'meeting-transcript.ready': 'Расшифровка готова',
    'meeting-transcript.failed': 'Не удалось расшифровать запись',
};

/**
 * The owner of the chat learns that the result of a transcription was posted into it. The text
 * names only the recording: the event carries no message or transcript text by design.
 */
export class MeetingTranscriptNotificationRule {
    apply(event: ChatSystemMessagePostedEvent): NotificationDraft[] {
        const type: NotificationType = event.topic;
        return [
            {
                recipientId: event.ownerId,
                type,
                content: NotificationContent.of({
                    title: TITLES[event.topic],
                    body: event.subject.fileName,
                }),
                target: NotificationTarget.of({ type: 'chat', id: event.sessionId }),
                actorId: null,
            },
        ];
    }
}
