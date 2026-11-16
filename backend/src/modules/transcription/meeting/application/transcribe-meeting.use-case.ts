import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../../shared/ddd';
import { OpenFileForProcessingUseCase } from '../../../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import { TranscriptionPermanentError, TranscriptionTimeoutError } from '../domain/errors';
import type { MeetingTranscript } from '../domain/meeting-transcript';
import {
    MeetingTranscriberPort,
    type MeetingTranscription,
} from '../domain/ports/meeting-transcriber.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { TranscriptSegmentRepositoryPort } from '../domain/ports/transcript-segment-repository.port';
import type { TranscriptionFailureReason } from '../domain/transcription-status';
import { releaseHoldSafely } from './release-hold-safely';

export interface TranscribeMeetingInput {
    fileId: string;
    /** Последняя попытка job'а: временная ошибка тоже переводит расшифровку в `failed`. */
    isFinalAttempt: boolean;
    /** Общий дедлайн job'а: его срабатывание — окончательный сбой `timeout`. */
    deadline?: AbortSignal;
}

/**
 * Одна попытка расшифровки записи. Временная ошибка на непоследней попытке пробрасывается
 * для повтора очередью; постоянная ошибка, дедлайн и последняя попытка дают `failed`.
 * Итоговый лог несёт суммарные секунды и стоимость у провайдера; текст расшифровки и имя
 * файла в лог не попадают.
 */
@Injectable()
export class TranscribeMeetingUseCase {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly segments: TranscriptSegmentRepositoryPort,
        private readonly transcriber: MeetingTranscriberPort,
        private readonly openFile: OpenFileForProcessingUseCase,
        private readonly releaseHold: ReleaseFileHoldUseCase,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(TranscribeMeetingUseCase.name);
    }

    async execute({
        fileId,
        isFinalAttempt,
        deadline = new AbortController().signal,
    }: TranscribeMeetingInput): Promise<void> {
        const transcript = await this.transactions.run(async () => {
            const current = await this.transcripts.findByFileIdForUpdate(fileId);
            if (current === null || current.isFinal()) return current;
            current.start();
            await this.transcripts.save(current);
            return current;
        });
        if (transcript === null) {
            this.logger.warn({ fileId, outcome: 'skipped' }, 'Meeting transcript not found');
            return;
        }
        if (transcript.isFinal()) {
            this.logger.info(
                { fileId, status: transcript.status, outcome: 'skipped' },
                'Meeting transcript is already final',
            );
            return;
        }
        const attempt = transcript.attempts;

        const startedAt = Date.now();
        let sizeBytes: number | undefined;
        let result: MeetingTranscription;
        try {
            const file = await this.openFile.execute(fileId);
            // `null` — запись удалена (потерю объекта активного файла files логирует сам).
            if (file === null) {
                throw new TranscriptionPermanentError('file-deleted', 'Recording is deleted');
            }
            sizeBytes = file.sizeBytes;
            result = await this.transcriber.transcribe(file, deadline);
        } catch (error: unknown) {
            const facts = {
                fileId,
                sizeBytes,
                attempts: transcript.attempts,
                elapsedMs: Date.now() - startedAt,
                errorCode: errorCodeOf(error),
            };
            const reason = deadline.aborted ? 'timeout' : failureReasonOf(error, isFinalAttempt);
            if (reason === null) {
                this.logger.warn(
                    { ...facts, outcome: 'retry' },
                    'Meeting transcription attempt failed',
                );
                throw error;
            }
            const failed = await this.finish(fileId, attempt, async (current) => {
                current.fail(reason, new Date());
                await this.transcripts.save(current);
            });
            if (failed === null) return;
            this.logger.warn(
                { ...facts, outcome: 'failed', reason },
                'Meeting transcription failed',
            );
            await releaseHoldSafely(this.releaseHold, this.logger, fileId);
            if (reason === 'timeout' && !(error instanceof TranscriptionPermanentError)) {
                throw new TranscriptionPermanentError('timeout', 'Meeting transcription timed out');
            }
            throw error;
        }

        const done = await this.finish(fileId, attempt, async (current) => {
            current.complete(result.transcript, new Date());
            await this.transcripts.save(current);
            await this.segments.insertAll(fileId, result.transcript.segments);
        });
        if (done === null) return;
        this.logger.info(
            {
                fileId,
                sizeBytes,
                durationSec: done.durationSec,
                speakerCount: done.speakerCount,
                attempts: done.attempts,
                outcome: done.status,
                usage: result.usage,
                elapsedMs: Date.now() - startedAt,
            },
            'Meeting transcribed',
        );
        await releaseHoldSafely(this.releaseHold, this.logger, fileId);
    }

    /**
     * Финальный переход под блокировкой строки и только из попытки этого job'а. Если расшифровку
     * уже закрыли (подписчик `file.deleted`, обработчик упавшего job'а) или запустили повтор,
     * ничего не сохраняет и не публикует: `null`. `transition` меняет и сохраняет расшифровку
     * (для `complete` — вместе с сегментами) в той же транзакции, что и событие.
     */
    private async finish(
        fileId: string,
        attempt: number,
        transition: (transcript: MeetingTranscript) => Promise<void>,
    ): Promise<MeetingTranscript | null> {
        const finished = await this.transactions.run(async () => {
            const current = await this.transcripts.findByFileIdForUpdate(fileId);
            if (current?.status !== 'processing' || current.attempts !== attempt) return null;
            await transition(current);
            await this.events.publish(current.pullDomainEvents());
            return current;
        });
        if (finished === null) {
            this.logger.info(
                { fileId, attempts: attempt, outcome: 'superseded' },
                'Meeting transcript was finished elsewhere, the job result is dropped',
            );
        }
        return finished;
    }
}

/** `null` — попытку можно повторить. Неизвестные ошибки считаются временными. */
function failureReasonOf(
    error: unknown,
    isFinalAttempt: boolean,
): TranscriptionFailureReason | null {
    if (error instanceof TranscriptionPermanentError) return error.reason;
    if (!isFinalAttempt) return null;
    return error instanceof TranscriptionTimeoutError ? 'timeout' : 'provider-unavailable';
}

// Только код или имя класса, а не `err`: сообщения провайдера могут содержать фрагменты ответа.
function errorCodeOf(error: unknown): string {
    if (!(error instanceof Error)) return 'unknown';
    return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}
