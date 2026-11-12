import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/ddd';
import { BaseError } from '../../../../shared/errors';
import type { EventSubscriber } from '../../../../shared/outbox/application/domain-event-registry';
import { FileUploadedEvent } from '../../../files/domain/events/file-uploaded.event';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { MeetingTranscriptionQueuePort } from '../domain/ports/meeting-transcription-queue.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';

export const START_MEETING_TRANSCRIPTION_SUBSCRIBER =
    'transcription.start-meeting-on-file-uploaded';

export class UnexpectedFileEventError extends BaseError {
    readonly code = 'TRANSCRIPTION.UNEXPECTED_SOURCE_EVENT';
}

/**
 * Для загруженной записи создаёт расшифровку `pending` и ставит job с `jobId = fileId`.
 * Повторная доставка безопасна: вставка идемпотентна, BullMQ отбрасывает дубль `jobId`.
 */
@Injectable()
export class StartMeetingTranscriptionOnFileUploaded implements EventSubscriber {
    readonly name = START_MEETING_TRANSCRIPTION_SUBSCRIBER;

    // Строка коммитится до `enqueue`: иначе воркер берёт job раньше коммита и не видит её.
    readonly isTransactional = false;

    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly queue: MeetingTranscriptionQueuePort,
    ) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof FileUploadedEvent)) {
            throw new UnexpectedFileEventError('Subscriber expects FileUploadedEvent', undefined, {
                subscriber: this.name,
                eventClass: event.constructor.name,
            });
        }
        if (event.kind !== 'recording') return;
        await this.transcripts.insertPendingIfAbsent(
            MeetingTranscript.createPending({
                fileId: event.fileId,
                ownerId: event.ownerId,
                now: new Date(event.metadata.timestamp),
            }),
        );
        // Job ставится и при уже существующей строке: прошлая доставка могла упасть на `enqueue`.
        await this.queue.enqueue(event.fileId, event.fileId);
    }
}
