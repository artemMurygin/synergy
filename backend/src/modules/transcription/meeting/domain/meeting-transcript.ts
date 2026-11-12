import { AggregateRoot } from '../../../../shared/ddd';
import type { DiarizedTranscript } from './diarized-transcript';
import {
    InvalidMeetingTranscriptStateError,
    MeetingTranscriptNotRetryableError,
    MeetingTranscriptTransitionError,
} from './errors';
import { MeetingTranscriptCompletedEvent } from './events/meeting-transcript-completed.event';
import { MeetingTranscriptFailedEvent } from './events/meeting-transcript-failed.event';
import { countSpeakers, type TranscriptSegment } from './transcript-segment';
import type {
    FinalTranscriptionStatus,
    TranscriptionFailureReason,
    TranscriptionStatus,
} from './transcription-status';

export interface MeetingTranscriptProps {
    ownerId: string;
    status: TranscriptionStatus;
    failureReason: TranscriptionFailureReason | null;
    language: string | null;
    durationSec: number | null;
    segments: readonly TranscriptSegment[];
    attempts: number;
    completedAt: Date | null;
}

export interface TranscriptFailure {
    reason: TranscriptionFailureReason;
    failedAt: Date;
}

export interface CreatePendingMeetingTranscriptInput {
    fileId: string;
    ownerId: string;
    now: Date;
}

export interface RestoreMeetingTranscriptInput extends MeetingTranscriptProps {
    fileId: string;
    createdAt: Date;
    updatedAt: Date;
}

const FINAL_STATUSES: readonly TranscriptionStatus[] = [
    'completed',
    'no_speech',
    'failed',
] satisfies FinalTranscriptionStatus[];

/**
 * Transcript of a meeting recording, keyed by the file id. Outlives the file.
 * `pending → processing → completed | no_speech | failed`, `failed → pending` via `retry`.
 */
export class MeetingTranscript extends AggregateRoot<MeetingTranscriptProps> {
    static createPending(input: CreatePendingMeetingTranscriptInput): MeetingTranscript {
        return new MeetingTranscript({
            id: input.fileId,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                ownerId: input.ownerId,
                status: 'pending',
                failureReason: null,
                language: null,
                durationSec: null,
                segments: [],
                attempts: 0,
                completedAt: null,
            },
        });
    }

    static restore({
        fileId,
        createdAt,
        updatedAt,
        ...props
    }: RestoreMeetingTranscriptInput): MeetingTranscript {
        return new MeetingTranscript({
            id: fileId,
            createdAt,
            updatedAt,
            props: { ...props, segments: [...props.segments] },
        });
    }

    get fileId(): string {
        return this.id;
    }

    get ownerId(): string {
        return this.props.ownerId;
    }

    get status(): TranscriptionStatus {
        return this.props.status;
    }

    get failureReason(): TranscriptionFailureReason | null {
        return this.props.failureReason;
    }

    get language(): string | null {
        return this.props.language;
    }

    get durationSec(): number | null {
        return this.props.durationSec;
    }

    get segments(): readonly TranscriptSegment[] {
        return this.props.segments;
    }

    get speakerCount(): number {
        return countSpeakers(this.props.segments);
    }

    get attempts(): number {
        return this.props.attempts;
    }

    get completedAt(): Date | null {
        return this.props.completedAt;
    }

    isFinal(): boolean {
        return FINAL_STATUSES.includes(this.props.status);
    }

    /** A new processing attempt; `processing` again when the queue retries the job. */
    start(): void {
        this.assertStatus(['pending', 'processing'], 'start');
        this.props.status = 'processing';
        this.props.attempts += 1;
        this.touch();
    }

    /** Empty segments mean `no_speech`. */
    complete(transcript: DiarizedTranscript, now: Date): void {
        this.assertStatus(['processing'], 'complete');
        const status = transcript.segments.length > 0 ? 'completed' : 'no_speech';
        this.props.status = status;
        this.props.segments = [...transcript.segments];
        this.props.language = transcript.language;
        this.props.durationSec = transcript.durationSec;
        this.props.completedAt = now;
        this.touch();
        this.addEvent(
            new MeetingTranscriptCompletedEvent({
                aggregateId: this.id,
                ownerId: this.ownerId,
                status,
                metadata: { timestamp: now.getTime(), userId: this.ownerId },
            }),
        );
    }

    fail(reason: TranscriptionFailureReason, now: Date): void {
        this.assertStatus(['pending', 'processing'], 'fail');
        this.props.status = 'failed';
        this.props.failureReason = reason;
        this.props.segments = [];
        this.props.completedAt = now;
        this.touch();
        this.addEvent(
            new MeetingTranscriptFailedEvent({
                aggregateId: this.id,
                ownerId: this.ownerId,
                reason,
                metadata: { timestamp: now.getTime(), userId: this.ownerId },
            }),
        );
    }

    /** Возвращает прежний сбой, чтобы откатить повтор, если job не удалось поставить. */
    retry(): TranscriptFailure {
        const { status, failureReason, completedAt } = this.props;
        if (status !== 'failed' || failureReason === null || completedAt === null) {
            throw new MeetingTranscriptNotRetryableError(
                `Only a failed transcript can be retried, status is ${status}`,
            );
        }
        this.props.status = 'pending';
        this.props.failureReason = null;
        this.props.completedAt = null;
        this.touch();
        return { reason: failureReason, failedAt: completedAt };
    }

    /** Без события: сбой уже был опубликован до повтора. */
    abandonRetry(previous: TranscriptFailure): void {
        this.assertStatus(['pending'], 'abandon the retry of');
        this.props.status = 'failed';
        this.props.failureReason = previous.reason;
        this.props.completedAt = previous.failedAt;
        this.touch();
    }

    validate(): void {
        const { status, failureReason, segments, completedAt, attempts, durationSec } = this.props;
        if (this.props.ownerId.length === 0) {
            throw new InvalidMeetingTranscriptStateError('Owner must not be empty');
        }
        if (!Number.isInteger(attempts) || attempts < 0) {
            throw new InvalidMeetingTranscriptStateError('Attempts must be a non-negative integer');
        }
        if ((status === 'failed') !== (failureReason !== null)) {
            throw new InvalidMeetingTranscriptStateError(
                'failureReason must be set exactly when status is failed',
            );
        }
        if ((status === 'completed') !== segments.length > 0) {
            throw new InvalidMeetingTranscriptStateError(
                'Segments must be present exactly when status is completed',
            );
        }
        if (this.isFinal() !== (completedAt !== null)) {
            throw new InvalidMeetingTranscriptStateError(
                'completedAt must be set exactly for a final status',
            );
        }
        if ((status === 'completed' || status === 'no_speech') && durationSec === null) {
            throw new InvalidMeetingTranscriptStateError(
                'A finished transcript must have a duration',
            );
        }
    }

    private assertStatus(allowed: readonly TranscriptionStatus[], action: string): void {
        if (!allowed.includes(this.props.status)) {
            throw new MeetingTranscriptTransitionError(
                `Cannot ${action} a meeting transcript in status ${this.props.status}`,
            );
        }
    }
}
