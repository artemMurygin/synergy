import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../../shared/ddd';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import type { TranscriptionFailureReason } from '../domain/transcription-status';
import { releaseHoldSafely } from './release-hold-safely';

export interface FailMeetingTranscriptionInput {
    fileId: string;
    reason: TranscriptionFailureReason;
}

/**
 * Окончательный сбой расшифровки, которую не довёл до конца её job: job упал вне use case
 * или запись удалили раньше, чем он отработал. Готовую расшифровку не трогает.
 */
@Injectable()
export class FailMeetingTranscriptionUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly releaseHold: ReleaseFileHoldUseCase,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(FailMeetingTranscriptionUseCase.name);
    }

    async execute({ fileId, reason }: FailMeetingTranscriptionInput): Promise<void> {
        // Блокировка строки: job, завершающий расшифровку одновременно, ждёт этой транзакции
        // и затем видит финальный статус, поэтому финальное событие публикуется один раз.
        const transcript = await this.transactions.run(async () => {
            const current = await this.transcripts.findByFileIdForUpdate(fileId);
            if (current === null || current.isFinal()) return null;
            current.fail(reason, new Date());
            await this.transcripts.save(current);
            await this.events.publish(current.pullDomainEvents());
            return current;
        });
        if (transcript === null) return;
        this.logger.warn(
            { fileId, reason, attempts: transcript.attempts, outcome: 'failed' },
            'Unfinished meeting transcription failed',
        );
        await releaseHoldSafely(this.releaseHold, this.logger, fileId);
    }
}
