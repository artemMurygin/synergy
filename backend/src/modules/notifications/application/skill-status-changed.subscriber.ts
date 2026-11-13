import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '../../../shared/ddd';
import type { EventSubscriber } from '../../../shared/outbox/application/domain-event-registry';
import { SkillStatusChangedEvent } from '../../portal/contracts/skill-status-changed.event';
import { SkillStatusChangedRule } from '../domain/skill-status-changed.rule';
import { CreateNotificationsUseCase } from './create-notifications.use-case';
import { UnexpectedSourceEventError } from './task-created.subscriber';

export const SKILL_STATUS_CHANGED_SUBSCRIBER = 'notifications.skill-status-changed';

/** On a skill status change: `request.status-changed` for each request of the event snapshot. */
@Injectable()
export class SkillStatusChangedSubscriber implements EventSubscriber {
    readonly name = SKILL_STATUS_CHANGED_SUBSCRIBER;

    private readonly rule = new SkillStatusChangedRule();

    constructor(private readonly createNotifications: CreateNotificationsUseCase) {}

    async handle(event: DomainEvent): Promise<void> {
        if (!(event instanceof SkillStatusChangedEvent)) {
            throw new UnexpectedSourceEventError(
                'Subscriber expects SkillStatusChangedEvent',
                undefined,
                { subscriber: this.name, eventClass: event.constructor.name },
            );
        }
        if (!this.rule.appliesTo(event)) return;
        await this.createNotifications.execute(event.id, this.rule.apply(event));
    }
}
