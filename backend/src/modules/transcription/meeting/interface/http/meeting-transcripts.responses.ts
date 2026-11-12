import { ApiProperty } from '@nestjs/swagger';
import type {
    MeetingTranscriptView,
    TranscriptSegmentView,
} from '../../application/meeting-transcript-view';
import type { SpeakerSummary } from '../../domain/speaker-summary';
import {
    TRANSCRIPTION_FAILURE_REASONS,
    TRANSCRIPTION_STATUSES,
    type TranscriptionFailureReason,
    type TranscriptionStatus,
} from '../../domain/transcription-status';

export class TranscriptSegmentResponse {
    @ApiProperty({ example: 0, description: 'Sequence number from zero, without gaps' })
    readonly seq: number;

    @ApiProperty({ example: 1, description: 'Speaker number from 1; see `speakers` for names' })
    readonly speaker: number;

    @ApiProperty({ example: 0, description: 'Seconds from the start of the recording' })
    readonly startSec: number;

    @ApiProperty({ example: 4.2 })
    readonly endSec: number;

    @ApiProperty({ example: 'Добрый день, начнём' })
    readonly text: string;

    constructor(segment: TranscriptSegmentView) {
        this.seq = segment.seq;
        this.speaker = segment.speaker;
        this.startSec = segment.startSec;
        this.endSec = segment.endSec;
        this.text = segment.text;
    }
}

export class SpeakerSummaryResponse {
    @ApiProperty({ example: 1 })
    readonly speaker: number;

    @ApiProperty({
        type: String,
        nullable: true,
        example: 'Анна',
        description: 'Assigned name; null means the default label «Спикер N»',
    })
    readonly name: string | null;

    @ApiProperty({ example: 312.5, description: 'Total talk time in seconds' })
    readonly talkSec: number;

    @ApiProperty({ example: 0.42, description: 'Share of the total talk time, 0..1' })
    readonly talkShare: number;

    constructor(speaker: SpeakerSummary) {
        this.speaker = speaker.speaker;
        this.name = speaker.name;
        this.talkSec = speaker.talkSec;
        this.talkShare = speaker.talkShare;
    }
}

export class SpeakersResponse {
    @ApiProperty({ type: [SpeakerSummaryResponse] })
    readonly speakers: SpeakerSummaryResponse[];

    constructor(speakers: readonly SpeakerSummary[]) {
        this.speakers = speakers.map((s) => new SpeakerSummaryResponse(s));
    }
}

export class MeetingTranscriptResponse {
    @ApiProperty({ example: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231' })
    readonly fileId: string;

    @ApiProperty({ enum: TRANSCRIPTION_STATUSES })
    readonly status: TranscriptionStatus;

    @ApiProperty({ enum: TRANSCRIPTION_FAILURE_REASONS, nullable: true, example: null })
    readonly failureReason: TranscriptionFailureReason | null;

    @ApiProperty({ type: String, nullable: true, example: 'ru' })
    readonly language: string | null;

    @ApiProperty({ type: Number, nullable: true, example: 5400 })
    readonly durationSec: number | null;

    @ApiProperty({ example: 2 })
    readonly speakerCount: number;

    @ApiProperty({
        type: [SpeakerSummaryResponse],
        nullable: true,
        description: 'Only for completed (empty for no_speech): numbers, names and talk time',
    })
    readonly speakers: SpeakerSummaryResponse[] | null;

    @ApiProperty({
        type: [TranscriptSegmentResponse],
        nullable: true,
        description: 'Only for completed and no_speech',
    })
    readonly segments: TranscriptSegmentResponse[] | null;

    @ApiProperty({ type: String, nullable: true, example: '2026-11-06T10:05:00.000Z' })
    readonly completedAt: string | null;

    constructor(view: MeetingTranscriptView) {
        this.fileId = view.fileId;
        this.status = view.status;
        this.failureReason = view.failureReason;
        this.language = view.language;
        this.durationSec = view.durationSec;
        this.speakerCount = view.speakerCount;
        this.speakers = view.speakers?.map((s) => new SpeakerSummaryResponse(s)) ?? null;
        this.segments = view.segments?.map((s) => new TranscriptSegmentResponse(s)) ?? null;
        this.completedAt = view.completedAt?.toISOString() ?? null;
    }
}
