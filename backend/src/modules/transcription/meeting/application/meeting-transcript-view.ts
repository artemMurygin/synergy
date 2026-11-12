import type { MeetingTranscript } from '../domain/meeting-transcript';
import type { TranscriptSegment } from '../domain/transcript-segment';
import type {
    TranscriptionFailureReason,
    TranscriptionStatus,
} from '../domain/transcription-status';

export interface MeetingTranscriptOfOwnerInput {
    ownerId: string;
    fileId: string;
}

export interface MeetingTranscriptView {
    fileId: string;
    status: TranscriptionStatus;
    failureReason: TranscriptionFailureReason | null;
    language: string | null;
    durationSec: number | null;
    speakerCount: number;
    /** Есть только у готовой расшифровки (`completed`, `no_speech`). */
    segments: TranscriptSegment[] | null;
    completedAt: Date | null;
}

export function toMeetingTranscriptView(transcript: MeetingTranscript): MeetingTranscriptView {
    const finished = transcript.status === 'completed' || transcript.status === 'no_speech';
    return {
        fileId: transcript.fileId,
        status: transcript.status,
        failureReason: transcript.failureReason,
        language: transcript.language,
        durationSec: transcript.durationSec,
        speakerCount: transcript.speakerCount,
        segments: finished
            ? transcript.segments.map(({ speaker, start, end, text }) => ({
                  speaker,
                  start,
                  end,
                  text,
              }))
            : null,
        completedAt: transcript.completedAt,
    };
}
