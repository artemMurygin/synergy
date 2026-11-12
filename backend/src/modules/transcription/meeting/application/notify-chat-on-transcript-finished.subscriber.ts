import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { DomainEvent } from '../../../../shared/ddd';
import { BaseError } from '../../../../shared/errors';
import type { EventSubscriber } from '../../../../shared/outbox/application/domain-event-registry';
import {
    MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
    MeetingTranscriptCompletedEvent,
} from '../domain/events/meeting-transcript-completed.event';
import {
    MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
    MeetingTranscriptFailedEvent,
} from '../domain/events/meeting-transcript-failed.event';
import { MeetingChatPort, type MeetingChatMessage } from '../domain/ports/meeting-chat.port';
import { MeetingFilesPort } from '../domain/ports/meeting-files.port';
import { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { findOwnedTranscript } from './find-owned-transcript';
import { MeetingDocuments } from './meeting-documents';
import { transcriptFinishedText, type TranscriptOutcome } from './transcript-finished-texts';

/** Имена подписчиков outbox: по одному на тип события, имена хранятся в строках outbox. */
export const NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS = {
    completed: 'transcription.notify-chat-on-transcript-completed',
    failed: 'transcription.notify-chat-on-transcript-failed',
} as const;

/** Допустимый максимум длительности записи для текста о `too-long`. */
export abstract class NotifyChatOnTranscriptFinishedSettings {
    abstract readonly maxRecordingSec: number;
}

export class UnexpectedTranscriptEventError extends BaseError {
    readonly code = 'MEETING_TRANSCRIPT_UNEXPECTED_EVENT';
}

const FALLBACK_RECORDING_NAME = 'Запись встречи';

interface RecordingState {
    readonly name: string;
    readonly stored: boolean;
}

type FinishedEvent = MeetingTranscriptCompletedEvent | MeetingTranscriptFailedEvent;
type ReportedFailure = Exclude<MeetingTranscriptFailedEvent['reason'], 'file-deleted'>;

/**
 * Готовая расшифровка приходит в чат, куда отправили запись: для `completed` — документ
 * расшифровки и число спикеров, для `no_speech` и `failed` — понятная причина. Запись не из
 * чата и удаление записи владельцем (`file-deleted`) ничего не дают. Ключ идемпотентности —
 * id события. Нетранзакционный: документ сохраняется в хранилище до постановки сообщения.
 */
@Injectable()
export class NotifyChatOnTranscriptFinished {
    constructor(
        private readonly transcripts: MeetingTranscriptRepositoryPort,
        private readonly documents: MeetingDocuments,
        private readonly files: MeetingFilesPort,
        private readonly chat: MeetingChatPort,
        private readonly settings: NotifyChatOnTranscriptFinishedSettings,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(NotifyChatOnTranscriptFinished.name);
    }

    /** Подписчик outbox для одного типа события. */
    subscriberFor(eventType: string): EventSubscriber {
        const name =
            eventType === MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE
                ? NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.completed
                : eventType === MEETING_TRANSCRIPT_FAILED_EVENT_TYPE
                  ? NOTIFY_CHAT_ON_TRANSCRIPT_SUBSCRIBERS.failed
                  : null;
        if (name === null) {
            throw new UnexpectedTranscriptEventError(
                'No chat notifier for the event type',
                undefined,
                {
                    eventType,
                },
            );
        }
        return { name, isTransactional: false, handle: (event) => this.handle(event) };
    }

    async handle(event: DomainEvent): Promise<void> {
        if (
            !(event instanceof MeetingTranscriptCompletedEvent) &&
            !(event instanceof MeetingTranscriptFailedEvent)
        ) {
            throw new UnexpectedTranscriptEventError(
                'Chat notifier expects a meeting transcript event',
                undefined,
                { eventClass: event.constructor.name },
            );
        }
        const failure = event instanceof MeetingTranscriptFailedEvent ? event.reason : null;
        // Запись удалил сам пользователь: ему не о чем сообщать.
        if (failure === 'file-deleted') return;

        const { ownerId, fileId } = event;
        const chatId = await this.chat.findChatOfRecording({ ownerId, fileId });
        if (chatId === null) return;

        const recording = await this.recordingState(ownerId, fileId);
        const message = await this.messageFor(event, failure, chatId, recording);
        await this.chat.post(message);
        this.logger.info(
            { fileId, chatId, status: event.status, eventId: event.id },
            'Meeting transcript result posted to the chat',
        );
    }

    private async messageFor(
        event: FinishedEvent,
        failure: ReportedFailure | null,
        chatId: string,
        recording: RecordingState,
    ): Promise<MeetingChatMessage> {
        const { ownerId, fileId } = event;
        let outcome: TranscriptOutcome;
        let attachments: string[] = [];
        if (failure !== null) {
            outcome = {
                kind: 'failed',
                reason: failure,
                recordingName: recording.name,
                recordingStored: recording.stored,
                maxRecordingSec: this.settings.maxRecordingSec,
            };
        } else if (event.status === 'no_speech') {
            outcome = { kind: 'no_speech', recordingName: recording.name };
        } else {
            const transcript = await findOwnedTranscript(this.transcripts, ownerId, fileId);
            const document = await this.documents.issueTranscript({ ownerId, fileId });
            attachments = [document.id];
            outcome = {
                kind: 'completed',
                speakerCount: transcript.speakerCount,
                durationSec: transcript.durationSec ?? 0,
            };
        }
        return {
            chatId,
            ownerId,
            text: transcriptFinishedText(outcome),
            attachments,
            dedupKey: event.id,
            topic:
                outcome.kind === 'failed'
                    ? 'meeting-transcript.failed'
                    : 'meeting-transcript.ready',
            recording: { fileId, fileName: recording.name },
        };
    }

    private async recordingState(ownerId: string, fileId: string): Promise<RecordingState> {
        const file = await this.files.findFile(ownerId, fileId);
        return file === null
            ? { name: FALLBACK_RECORDING_NAME, stored: false }
            : { name: file.name, stored: file.isStored };
    }
}
