import { Injectable } from '@nestjs/common';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import { summarizeSpeakers } from '../domain/speaker-summary';
import { findOwnedTranscript } from './find-owned-transcript';
import {
    isFinishedTranscript,
    toMeetingTranscriptView,
    type MeetingTranscriptOfOwnerInput,
    type MeetingTranscriptView,
} from './meeting-transcript-view';

/**
 * Статус, сегменты и собеседники с именами и временем речи. Не зависит от файла, поэтому
 * работает и после его удаления. 404 — чужая.
 */
@Injectable()
export class GetMeetingTranscriptUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
    ) {}

    async execute({
        ownerId,
        fileId,
    }: MeetingTranscriptOfOwnerInput): Promise<MeetingTranscriptView> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        if (!isFinishedTranscript(transcript)) return toMeetingTranscriptView(transcript, null);
        const [segments, stats] = await Promise.all([
            this.segments.readAll(fileId),
            this.segments.speakerStats(fileId),
        ]);
        return toMeetingTranscriptView(transcript, {
            segments,
            speakers: summarizeSpeakers(transcript.speakerCount, transcript.speakerNames, stats),
        });
    }
}
