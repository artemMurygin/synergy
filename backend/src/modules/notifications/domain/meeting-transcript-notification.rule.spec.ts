import { describe, expect, it } from 'vitest';
import { ChatSystemMessagePostedEvent } from '../../assistant/contracts/chat-system-message-posted.event';
import { MeetingTranscriptNotificationRule } from './meeting-transcript-notification.rule';
import { MAX_NOTIFICATION_TITLE_LENGTH } from './notification-content';

const CHAT_ID = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function posted(
    topic: 'meeting-transcript.ready' | 'meeting-transcript.failed',
): ChatSystemMessagePostedEvent {
    return new ChatSystemMessagePostedEvent({
        aggregateId: CHAT_ID,
        ownerId: 'owner-id',
        messageId: 42,
        topic,
        subject: { fileId: 'file-1', fileName: 'встреча-12-ноя.m4a' },
    });
}

describe('MeetingTranscriptNotificationRule', () => {
    const rule = new MeetingTranscriptNotificationRule();

    it('drafts meeting-transcript.ready for the chat owner with a link to the chat', () => {
        const [draft, ...rest] = rule.apply(posted('meeting-transcript.ready'));

        expect(rest).toEqual([]);
        expect(draft.recipientId).toBe('owner-id');
        expect(draft.type).toBe('meeting-transcript.ready');
        expect(draft.content.title).toBe('Расшифровка готова: встреча-12-ноя.m4a');
        expect(draft.content.body).toBe('встреча-12-ноя.m4a');
        expect(draft.target.type).toBe('chat');
        expect(draft.target.id).toBe(CHAT_ID);
        expect(draft.actorId).toBeNull();
    });

    it('drafts meeting-transcript.failed for a failed transcription', () => {
        const [draft] = rule.apply(posted('meeting-transcript.failed'));

        expect(draft.type).toBe('meeting-transcript.failed');
        expect(draft.content.title).toBe('Не удалось расшифровать запись: встреча-12-ноя.m4a');
        expect(draft.content.body).toBe('встреча-12-ноя.m4a');
        expect(draft.target.type).toBe('chat');
    });

    it('shortens the title of a very long recording name to the limit', () => {
        const fileName = `${'а'.repeat(300)}.m4a`;
        const [draft] = new MeetingTranscriptNotificationRule().apply(
            new ChatSystemMessagePostedEvent({
                aggregateId: CHAT_ID,
                ownerId: 'owner-id',
                messageId: 42,
                topic: 'meeting-transcript.ready',
                subject: { fileId: 'file-1', fileName },
            }),
        );

        expect(draft.content.title.length).toBe(MAX_NOTIFICATION_TITLE_LENGTH);
        expect(draft.content.title.startsWith('Расшифровка готова: ааа')).toBe(true);
        expect(draft.content.title.endsWith('…')).toBe(true);
    });
});
