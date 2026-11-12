import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../../../shared/ddd';
import { TRANSCRIPTION_FAILURE_REASONS } from '../transcription-status';

export const MEETING_TRANSCRIPT_FAILED_EVENT_TYPE = 'meeting-transcript.failed';

export const meetingTranscriptFailedPayloadSchema = z.object({
    ownerId: z.string().min(1),
    reason: z.enum(TRANSCRIPTION_FAILURE_REASONS),
});

export type MeetingTranscriptFailedPayload = z.infer<typeof meetingTranscriptFailedPayloadSchema>;

export class MeetingTranscriptFailedEvent extends DomainEvent {
    readonly ownerId: string;

    readonly reason: MeetingTranscriptFailedPayload['reason'];

    readonly status = 'failed';

    constructor(props: DomainEventProps<MeetingTranscriptFailedPayload>) {
        super(props);
        this.ownerId = props.ownerId;
        this.reason = props.reason;
    }

    get fileId(): string {
        return this.aggregateId;
    }
}
