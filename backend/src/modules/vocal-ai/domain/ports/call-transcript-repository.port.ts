import type { CallId } from '../value-objects/call-id.value-object';
import type { CallTranscript } from '../entities/call-transcript.entity';

export abstract class CallTranscriptRepositoryPort {
    abstract exists(callId: CallId): Promise<boolean>;

    abstract save(transcript: CallTranscript): Promise<void>;

    abstract findByCallId(callId: CallId): Promise<CallTranscript | null>;
}
