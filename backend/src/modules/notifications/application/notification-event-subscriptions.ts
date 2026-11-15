import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../shared/outbox/application/domain-event-registry';
import { CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE } from '../../assistant/contracts/chat-system-message-posted.event';
import { REQUEST_ACCEPTED_EVENT_TYPE } from '../../portal/contracts/request-accepted.event';
import { REQUEST_REJECTED_EVENT_TYPE } from '../../portal/contracts/request-rejected.event';
import { REQUEST_COMMENT_POSTED_EVENT_TYPE } from '../../portal/contracts/request-comment-posted.event';
import { REQUEST_TAKEN_EVENT_TYPE } from '../../portal/contracts/request-taken.event';
import { SKILL_STATUS_CHANGED_EVENT_TYPE } from '../../portal/contracts/skill-status-changed.event';
import { TASK_CREATED_EVENT_TYPE } from '../../tasks/contracts/task-created.event';
import { ChatSystemMessagePostedSubscriber } from './chat-system-message-posted.subscriber';
import { registerNotificationEvents } from './register-notification-events';
import { RequestCommentPostedSubscriber } from './request-comment-posted.subscriber';
import { RequestDecidedSubscriber } from './request-decided.subscriber';
import { RequestTakenSubscriber } from './request-taken.subscriber';
import { SkillStatusChangedSubscriber } from './skill-status-changed.subscriber';
import { TaskCreatedSubscriber } from './task-created.subscriber';

@Injectable()
export class NotificationEventSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        private readonly taskCreatedSubscriber: TaskCreatedSubscriber,
        private readonly chatSystemMessageSubscriber: ChatSystemMessagePostedSubscriber,
        private readonly requestDecidedSubscriber: RequestDecidedSubscriber,
        private readonly skillStatusChangedSubscriber: SkillStatusChangedSubscriber,
        private readonly requestTakenSubscriber: RequestTakenSubscriber,
        private readonly requestCommentPostedSubscriber: RequestCommentPostedSubscriber,
    ) {}

    onModuleInit(): void {
        registerNotificationEvents(this.registry);
        this.registry.subscribe(TASK_CREATED_EVENT_TYPE, this.taskCreatedSubscriber);
        this.registry.subscribe(
            CHAT_SYSTEM_MESSAGE_POSTED_EVENT_TYPE,
            this.chatSystemMessageSubscriber,
        );
        this.registry.subscribe(REQUEST_ACCEPTED_EVENT_TYPE, this.requestDecidedSubscriber);
        this.registry.subscribe(
            REQUEST_REJECTED_EVENT_TYPE,
            this.requestDecidedSubscriber.rejections(),
        );
        this.registry.subscribe(REQUEST_TAKEN_EVENT_TYPE, this.requestTakenSubscriber);
        this.registry.subscribe(
            REQUEST_COMMENT_POSTED_EVENT_TYPE,
            this.requestCommentPostedSubscriber,
        );
        this.registry.subscribe(SKILL_STATUS_CHANGED_EVENT_TYPE, this.skillStatusChangedSubscriber);
    }
}
