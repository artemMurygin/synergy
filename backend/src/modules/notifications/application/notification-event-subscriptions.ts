import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { TASK_CREATED_EVENT_TYPE } from '../../tasks/contracts/task-created.event';
import { registerNotificationEvents } from './register-notification-events';
import { TaskCreatedSubscriber } from './task-created.subscriber';

@Injectable()
export class NotificationEventSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        private readonly taskCreatedSubscriber: TaskCreatedSubscriber,
    ) {}

    onModuleInit(): void {
        registerNotificationEvents(this.registry);
        this.registry.subscribe(TASK_CREATED_EVENT_TYPE, this.taskCreatedSubscriber);
    }
}
