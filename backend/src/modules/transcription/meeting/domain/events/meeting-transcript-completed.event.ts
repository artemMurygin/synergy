import { z } from 'zod';
import { DomainEvent, type DomainEventProps } from '../../../../../shared/ddd';

export const MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE = 'meeting-transcript.completed';

/** No transcript text: the event only says the result is ready. */
export const meetingTranscriptCompletedPayloadSchema = z.object({
    ownerId: z.string().min(1),
    status: z.enum(['completed', 'no_speech']),
});

export type MeetingTranscriptCompletedPayload = z.infer<
    typeof meetingTranscriptCompletedPayloadSchema
>;

export class MeetingTranscriptCompletedEvent extends DomainEvent {
    readonly ownerId: string;

    readonly status: MeetingTranscriptCompletedPayload['status'];

    constructor(props: DomainEventProps<MeetingTranscriptCompletedPayload>) {
        super(props);
        this.ownerId = props.ownerId;
        this.status = props.status;
    }

    get fileId(): string {
        return this.aggregateId;
    }
}
