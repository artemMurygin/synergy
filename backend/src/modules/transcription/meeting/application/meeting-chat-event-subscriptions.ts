import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../../shared/outbox/application/domain-event-registry';
import { MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE } from '../domain/events/meeting-transcript-completed.event';
import { MEETING_TRANSCRIPT_FAILED_EVENT_TYPE } from '../domain/events/meeting-transcript-failed.event';
import { NotifyChatOnTranscriptFinished } from './notify-chat-on-transcript-finished.subscriber';

/** Сообщение в чат по окончательному статусу расшифровки. События регистрирует модуль встреч. */
@Injectable()
export class MeetingChatEventSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        private readonly notifier: NotifyChatOnTranscriptFinished,
    ) {}

    onModuleInit(): void {
        for (const type of [
            MEETING_TRANSCRIPT_COMPLETED_EVENT_TYPE,
            MEETING_TRANSCRIPT_FAILED_EVENT_TYPE,
        ]) {
            this.registry.subscribe(type, this.notifier.subscriberFor(type));
        }
    }
}
