import type { DomainEventRegistry } from '../../../../shared/outbox/application/domain-event-registry';
import {
    MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
    MeetingTranscriptCompletedEvent,
    meetingTranscriptCompletedPayloadSchema,
    type MeetingTranscriptCompletedPayload,
} from '../domain/events/meeting-transcript-completed.event';
import {
    MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
    MeetingTranscriptFailedEvent,
    meetingTranscriptFailedPayloadSchema,
    type MeetingTranscriptFailedPayload,
} from '../domain/events/meeting-transcript-failed.event';

/** События без текста расшифровки. */
export function registerMeetingTranscriptEvents(registry: DomainEventRegistry): void {
    registry.registerEvent({
        eventType: MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
        eventClass: MeetingTranscriptCompletedEvent,
        schema: meetingTranscriptCompletedPayloadSchema,
        toPayload: (event): MeetingTranscriptCompletedPayload => ({
            ownerId: event.ownerId,
            status: event.status,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new MeetingTranscriptCompletedEvent({ id, aggregateId, metadata, ...payload }),
    });
    registry.registerEvent({
        eventType: MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
        eventClass: MeetingTranscriptFailedEvent,
        schema: meetingTranscriptFailedPayloadSchema,
        toPayload: (event): MeetingTranscriptFailedPayload => ({
            ownerId: event.ownerId,
            reason: event.reason,
        }),
        fromRecord: ({ id, aggregateId, metadata, payload }) =>
            new MeetingTranscriptFailedEvent({ id, aggregateId, metadata, ...payload }),
    });
}
