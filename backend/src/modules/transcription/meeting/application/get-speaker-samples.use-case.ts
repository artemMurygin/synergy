import { Injectable } from '@nestjs/common';
import { TranscriptNotReadyError } from '../domain/errors';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import { summarizeSpeakers, type SpeakerSummary } from '../domain/speaker-summary';
import type { TranscriptSegment } from '../domain/transcript-segment';
import { findOwnedTranscript } from './find-owned-transcript';
import type { MeetingTranscriptOfOwnerInput } from './meeting-transcript-view';

/** Сколько характерных реплик показывать на спикера. */
export const SAMPLES_PER_SPEAKER = 3;

export interface SpeakerSamples {
    speakers: SpeakerSummary[];
    /** До трёх самых длинных реплик каждого спикера из разных третей записи, по `seq`. */
    samples: TranscriptSegment[];
}

/**
 * Опознание спикеров: все спикеры с именами и долей речи и их характерные реплики.
 * 404 — чужая или нет, 409 — расшифровка не `completed`.
 */
@Injectable()
export class GetSpeakerSamplesUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
    ) {}

    async execute({ ownerId, fileId }: MeetingTranscriptOfOwnerInput): Promise<SpeakerSamples> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        if (transcript.status !== 'completed') {
            throw new TranscriptNotReadyError(
                `Speaker samples need a completed transcript, status is ${transcript.status}`,
            );
        }
        const [stats, samples] = await Promise.all([
            this.segments.speakerStats(fileId),
            this.segments.samples(fileId, SAMPLES_PER_SPEAKER),
        ]);
        return {
            speakers: summarizeSpeakers(transcript.speakerCount, transcript.speakerNames, stats),
            samples,
        };
    }
}
