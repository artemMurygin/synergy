import { AggregateRoot } from '../../../../shared/ddd';
import type { DiarizedTranscript } from './diarized-transcript';
import {
    InvalidMeetingTranscriptStateError,
    MeetingTranscriptNotRetryableError,
    MeetingTranscriptTransitionError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from './errors';
import { MeetingTranscriptCompletedEvent } from './events/meeting-transcript-completed.event';
import { MeetingTranscriptFailedEvent } from './events/meeting-transcript-failed.event';
import { SpeakerAssignment, type SpeakerAssignmentInput } from './speaker-assignment';
import { SpeakerNames } from './speaker-names';
import { countSpeakers } from './transcript-segment';
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
    /** Число собеседников; больше нуля ровно у `completed`. */
    speakerCount: number;
    speakerNames: SpeakerNames;
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
                speakerCount: 0,
                speakerNames: SpeakerNames.empty(),
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
            props: { ...props },
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

    get speakerCount(): number {
        return this.props.speakerCount;
    }

    get speakerNames(): SpeakerNames {
        return this.props.speakerNames;
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

    /**
     * Empty segments mean `no_speech`. Сами сегменты в агрегат не входят: их пишет
     * `TranscriptSegmentRepositoryPort` в той же транзакции, что и `save`.
     */
    complete(transcript: DiarizedTranscript, now: Date): void {
        this.assertStatus(['processing'], 'complete');
        const status = transcript.segments.length > 0 ? 'completed' : 'no_speech';
        this.props.status = status;
        this.props.speakerCount = countSpeakers(transcript.segments);
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
        this.props.speakerCount = 0;
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

    /**
     * Назначает имена собеседникам готовой расшифровки: всё или ничего. Пустое имя сбрасывает
     * имя к метке «Спикер N»; одно имя может стоять у нескольких собеседников.
     */
    assignSpeakers(assignments: readonly SpeakerAssignmentInput[]): void {
        if (this.props.status !== 'completed') {
            throw new TranscriptNotReadyError(
                `Speaker names can be assigned only to a completed transcript, status is ${this.props.status}`,
            );
        }
        const unknown = [
            ...new Set(
                assignments
                    .map((a) => a.speaker)
                    .filter((n) => !Number.isInteger(n) || n < 1 || n > this.props.speakerCount),
            ),
        ];
        if (unknown.length > 0) throw new UnknownSpeakerError(unknown);
        const checked = assignments.map((a) => SpeakerAssignment.of(a));
        this.props.speakerNames = this.props.speakerNames.assign(checked);
        this.touch();
    }

    validate(): void {
        const { status, failureReason, speakerCount, speakerNames, completedAt, attempts } =
            this.props;
        const { durationSec } = this.props;
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
        if (!Number.isInteger(speakerCount) || speakerCount < 0) {
            throw new InvalidMeetingTranscriptStateError(
                'Speaker count must be a non-negative integer',
            );
        }
        if ((status === 'completed') !== speakerCount > 0) {
            throw new InvalidMeetingTranscriptStateError(
                'Speakers must be present exactly when status is completed',
            );
        }
        if (speakerNames.maxSpeaker() > speakerCount) {
            throw new InvalidMeetingTranscriptStateError(
                'A named speaker must be within the speaker count',
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
