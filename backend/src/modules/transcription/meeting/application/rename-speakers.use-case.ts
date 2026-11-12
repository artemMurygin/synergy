import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import type { SpeakerAssignmentInput } from '../domain/speaker-assignment';
import { summarizeSpeakers, type SpeakerSummary } from '../domain/speaker-summary';
import { MeetingTranscriptNotFoundError } from './errors';

export interface RenameSpeakersInput {
    ownerId: string;
    fileId: string;
    assignments: readonly SpeakerAssignmentInput[];
}

/**
 * Назначает имена собеседникам одним вызовом: всё или ничего. 404 — чужая или нет,
 * 409 — не `completed`, 422 — неизвестный собеседник или некорректное имя.
 * Возвращает всех собеседников с именами и временем речи.
 */
@Injectable()
export class RenameSpeakersUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    async execute({
        ownerId,
        fileId,
        assignments,
    }: RenameSpeakersInput): Promise<SpeakerSummary[]> {
        const transcript = await this.transactions.run(async () => {
            const current = await this.transcripts.findByFileIdForUpdate(fileId);
            if (current?.ownerId !== ownerId) throw new MeetingTranscriptNotFoundError(fileId);
            current.assignSpeakers(assignments);
            await this.transcripts.save(current);
            return current;
        });
        const stats = await this.segments.speakerStats(fileId);
        return summarizeSpeakers(transcript.speakerCount, transcript.speakerNames, stats);
    }
}
