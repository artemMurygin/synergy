import type { MeetingTranscript } from '../domain/meeting-transcript';
import type { SpeakerSummary } from '../domain/speaker-summary';
import type { TranscriptSegment } from '../domain/transcript-segment';
import type {
    TranscriptionFailureReason,
    TranscriptionStatus,
} from '../domain/transcription-status';

export interface MeetingTranscriptOfOwnerInput {
    ownerId: string;
    fileId: string;
}

export interface TranscriptSegmentView {
    seq: number;
    speaker: number;
    startSec: number;
    endSec: number;
    text: string;
}

export interface MeetingTranscriptView {
    fileId: string;
    status: TranscriptionStatus;
    failureReason: TranscriptionFailureReason | null;
    language: string | null;
    durationSec: number | null;
    speakerCount: number;
    /** Есть только у готовой расшифровки (`completed`, `no_speech`); у `no_speech` пусто. */
    speakers: SpeakerSummary[] | null;
    /** Есть только у готовой расшифровки (`completed`, `no_speech`). */
    segments: TranscriptSegmentView[] | null;
    completedAt: Date | null;
}

export interface FinishedTranscriptContent {
    segments: readonly TranscriptSegment[];
    speakers: readonly SpeakerSummary[];
}

export function isFinishedTranscript(transcript: MeetingTranscript): boolean {
    return transcript.status === 'completed' || transcript.status === 'no_speech';
}

/** `content` передаётся только для готовой расшифровки. */
export function toMeetingTranscriptView(
    transcript: MeetingTranscript,
    content: FinishedTranscriptContent | null,
): MeetingTranscriptView {
    const finished = content !== null && isFinishedTranscript(transcript);
    return {
        fileId: transcript.fileId,
        status: transcript.status,
        failureReason: transcript.failureReason,
        language: transcript.language,
        durationSec: transcript.durationSec,
        speakerCount: transcript.speakerCount,
        speakers: finished ? content.speakers.map((s) => ({ ...s })) : null,
        segments: finished
            ? content.segments.map(({ seq, speaker, startSec, endSec, text }) => ({
                  seq,
                  speaker,
                  startSec,
                  endSec,
                  text,
              }))
            : null,
        completedAt: transcript.completedAt,
    };
}
