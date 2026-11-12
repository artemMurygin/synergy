import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../../shared/ddd';
import type { EventSubscriber } from '../../../../shared/outbox/application/domain-event-registry';
import { FileDeletedEvent } from '../../../files/domain/events/file-deleted.event';
import { FailMeetingTranscriptionUseCase } from './fail-meeting-transcription.use-case';
import { UnexpectedFileEventError } from './start-meeting-transcription-on-file-uploaded.subscriber';

export const FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER =
    'transcription.fail-meeting-on-file-deleted';

/**
 * Запись удалена, а расшифровка не завершена: без этого она осталась бы в `pending` или
 * `processing` навсегда. Удаление владельцем даёт `file-deleted`; очистка удаляет
 * незавершённую запись только по максимуму удержания, поэтому её причина — `timeout`.
 */
@Injectable()
export class FailMeetingTranscriptionOnFileDeleted implements EventSubscriber {
    readonly name = FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER;

    readonly isTransactional = false;

    constructor(private readonly failTranscription: FailMeetingTranscriptionUseCase) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof FileDeletedEvent)) {
            throw new UnexpectedFileEventError('Subscriber expects FileDeletedEvent', undefined, {
                subscriber: this.name,
                eventClass: event.constructor.name,
            });
        }
        if (event.kind !== 'recording') return;
        await this.failTranscription.execute({
            fileId: event.fileId,
            reason: event.cause === 'retention' ? 'timeout' : 'file-deleted',
        });
    }
}
