import { ApiProperty } from '@nestjs/swagger';
import type { MeetingTranscriptView } from '../../application/meeting-transcript-view';
import {
    TRANSCRIPTION_FAILURE_REASONS,
    TRANSCRIPTION_STATUSES,
    type TranscriptionFailureReason,
    type TranscriptionStatus,
} from '../../domain/transcription-status';

export class TranscriptSegmentResponse {
    @ApiProperty({ example: 'Спикер 1' })
    readonly speaker: string;

    @ApiProperty({ example: 0, description: 'Seconds from the start of the recording' })
    readonly start: number;

    @ApiProperty({ example: 4.2 })
    readonly end: number;

    @ApiProperty({ example: 'Добрый день, начнём' })
    readonly text: string;

    constructor(segment: TranscriptSegmentResponse) {
        this.speaker = segment.speaker;
        this.start = segment.start;
        this.end = segment.end;
        this.text = segment.text;
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
        this.segments = view.segments?.map((s) => new TranscriptSegmentResponse(s)) ?? null;
        this.completedAt = view.completedAt?.toISOString() ?? null;
    }
}
