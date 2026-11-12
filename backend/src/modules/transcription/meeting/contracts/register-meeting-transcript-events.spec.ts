import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../../shared/ddd';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
    type SerializedEvent,
} from '../../../../shared/outbox/application/domain-event-registry';
import {
    MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
    MeetingTranscriptCompletedEvent,
} from '../domain/events/meeting-transcript-completed.event';
import {
    MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
    MeetingTranscriptFailedEvent,
} from '../domain/events/meeting-transcript-failed.event';
import { registerMeetingTranscriptEvents } from './register-meeting-transcript-events';

const FILE_ID = '5b0e6c1e-7d1f-4f43-9a3e-2b1c0d9e8f7a';
const metadata = { timestamp: 1_700_000_000_000, userId: 'owner' };

function registry(): DomainEventRegistry {
    const events = new DomainEventRegistry();
    registerMeetingTranscriptEvents(events);
    return events;
}

function roundTrip(
    events: DomainEventRegistry,
    original: MeetingTranscriptCompletedEvent | MeetingTranscriptFailedEvent,
): { serialized: SerializedEvent; restored: DomainEvent } {
    const serialized = events.serialize(original);
    return {
        serialized,
        restored: events.restore({
            id: original.id,
            eventType: serialized.eventType,
            aggregateId: original.aggregateId,
            payload: JSON.parse(JSON.stringify(serialized.payload)),
            metadata: JSON.parse(JSON.stringify(original.metadata)),
        }),
    };
}

describe('meeting transcript events registration', () => {
    it('serializes and restores meeting-transcript.completed without text', () => {
        const events = registry();
        const original = new MeetingTranscriptCompletedEvent({
            aggregateId: FILE_ID,
            ownerId: 'owner',
            status: 'no_speech',
            metadata,
        });

        const { serialized, restored } = roundTrip(events, original);

        expect(serialized.eventType).toBe(MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE);
        expect(serialized.payload).toEqual({ ownerId: 'owner', status: 'no_speech' });
        expect(restored).toBeInstanceOf(MeetingTranscriptCompletedEvent);
        if (!(restored instanceof MeetingTranscriptCompletedEvent)) return;
        expect(restored.id).toBe(original.id);
        expect(restored.fileId).toBe(FILE_ID);
        expect(restored.ownerId).toBe('owner');
        expect(restored.status).toBe('no_speech');
        expect(restored.metadata).toEqual(original.metadata);
    });

    it('serializes and restores meeting-transcript.failed', () => {
        const events = registry();
        const original = new MeetingTranscriptFailedEvent({
            aggregateId: FILE_ID,
            ownerId: 'owner',
            reason: 'too-long',
            metadata,
        });

        const { serialized, restored } = roundTrip(events, original);

        expect(serialized.eventType).toBe(MEETING_TRANSCRIPT_FAILED_EVENT_TYPE);
        expect(serialized.payload).toEqual({ ownerId: 'owner', reason: 'too-long' });
        expect(restored).toBeInstanceOf(MeetingTranscriptFailedEvent);
        if (!(restored instanceof MeetingTranscriptFailedEvent)) return;
        expect(restored.fileId).toBe(FILE_ID);
        expect(restored.ownerId).toBe('owner');
        expect(restored.reason).toBe('too-long');
    });

    it.each([
        [MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE, { ownerId: 'o', status: 'failed' }],
        [MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE, { status: 'completed' }],
        [MEETING_TRANSCRIPT_FAILED_EVENT_TYPE, { ownerId: 'o', reason: 'oops' }],
        [MEETING_TRANSCRIPT_FAILED_EVENT_TYPE, { reason: 'timeout' }],
    ])('rejects an invalid %s payload %j', (eventType, payload) => {
        expect(() =>
            registry().restore({ id: 'e1', eventType, aggregateId: FILE_ID, payload, metadata }),
        ).toThrow(InvalidEventPayloadError);
    });
});
