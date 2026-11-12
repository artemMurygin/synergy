import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { HoldFileUseCase } from '../../../files/application/hold-file.use-case';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import { MeetingTranscriptNotRetryableError } from '../domain/errors';
import type { MeetingTranscript, TranscriptFailure } from '../domain/meeting-transcript';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { MeetingTranscriptionQueuePort } from '../domain/ports/meeting-transcription-queue.port';
import { findOwnedTranscript } from './find-owned-transcript';
import type { MeetingTranscriptOfOwnerInput } from './meeting-transcript-view';

// BullMQ запрещает собственный jobId с одним двоеточием, поэтому не `${fileId}:${attempts}`.
export function retryJobId(fileId: string, attempts: number): string {
    return `${fileId}-retry-${String(attempts)}`;
}

/**
 * 404 — чужая, 409 — не `failed`, 410 — запись удалена (FileGoneError из HoldFile).
 * Удержание и `pending` сохраняются в одной транзакции; job ставится после коммита,
 * а если не встал, расшифровка возвращается в `failed` и удержание снимается.
 */
@Injectable()
export class RetryMeetingTranscriptionUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly holdFile: HoldFileUseCase,
        private readonly releaseHold: ReleaseFileHoldUseCase,
        private readonly queue: MeetingTranscriptionQueuePort,
        private readonly transactions: TransactionRunnerPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(RetryMeetingTranscriptionUseCase.name);
    }

    async execute({ ownerId, fileId }: MeetingTranscriptOfOwnerInput): Promise<void> {
        const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
        if (transcript.status !== 'failed') {
            throw new MeetingTranscriptNotRetryableError(
                `Only a failed transcript can be retried, status is ${transcript.status}`,
            );
        }
        const previous = await this.transactions.run(async () => {
            await this.holdFile.execute(fileId);
            const failure = transcript.retry();
            await this.transcripts.save(transcript);
            return failure;
        });
        try {
            // Номер попытки делает jobId новым: прежний job мог остаться в списке упавших.
            await this.queue.enqueue(fileId, retryJobId(fileId, transcript.attempts));
        } catch (error: unknown) {
            await this.rollBack(transcript, previous);
            throw error;
        }
    }

    private async rollBack(
        transcript: MeetingTranscript,
        previous: TranscriptFailure,
    ): Promise<void> {
        try {
            await this.transactions.run(async () => {
                transcript.abandonRetry(previous);
                await this.transcripts.save(transcript);
                await this.releaseHold.execute(transcript.fileId);
            });
        } catch (error: unknown) {
            this.logger.error(
                { fileId: transcript.fileId, err: error },
                'Failed to roll back a meeting transcription retry',
            );
        }
    }
}
