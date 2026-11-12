import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE } from '../../assistant/contracts/chat-system-message-posted.event';
import { TASK_CREATED_EVENT_TYPE } from '../../tasks/contracts/task-created.event';
import { ChatSystemMessagePostedSubscriber } from './chat-system-message-posted.subscriber';
import { registerNotificationEvents } from './register-notification-events';
import { TaskCreatedSubscriber } from './task-created.subscriber';

@Injectable()
export class NotificationEventSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        private readonly taskCreatedSubscriber: TaskCreatedSubscriber,
        private readonly chatSystemMessageSubscriber: ChatSystemMessagePostedSubscriber,
    ) {}

    onModuleInit(): void {
        registerNotificationEvents(this.registry);
        this.registry.subscribe(TASK_CREATED_EVENT_TYPE, this.taskCreatedSubscriber);
        this.registry.subscribe(
            CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
            this.chatSystemMessageSubscriber,
        );
    }
}
