import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { ChatSystemMessagePostedEvent } from '../../assistant/contracts/chat-system-message-posted.event';
import { MeetingTranscriptNotificationRule } from '../domain/meeting-transcript-notification.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const CHAT_SYSTEM_MESSAGE_SUBSCRIBER = 'notifications.chat-system-message';

/**
 * A system message about a transcription was posted into a chat: the owner gets a notification
 * linked to that chat. No message posted means no event, so no notification either.
 */
@Injectable()
export class ChatSystemMessagePostedSubscriber implements EventSubscriber {
    readonly name = CHAT_SYSTEM_MESSAGE_SUBSCRIBER;

    private readonly rule = new MeetingTranscriptNotificationRule();

    constructor(private readonly createNotifications: CreateNotificationsUseCase) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof ChatSystemMessagePostedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects ChatSystemMessagePostedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        await this.createNotifications.execute(event.id, this.rule.apply(event));
    }
}
