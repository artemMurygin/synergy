import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { Notification } from '../domain/notification';
import type { NotificationDraft } from '../domain/notification-draft';
import { NotificationClockPort } from '../domain/ports/notification-clock.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';
import { NotificationCreationMetricsPort } from './ports/notification-creation-metrics.port';

@Injectable()
export class CreateNotificationsUseCase {
    constructor(
        private readonly notifications: NotificationRepositoryPort,
        private readonly clock: NotificationClockPort,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly metrics: NotificationCreationMetricsPort,
    ) {}

    async execute(
        sourceEventId: string,
        drafts: readonly NotificationDraft[],
    ): Promise<Notification[]> {
        if (drafts.length === 0) return [];
        const now = this.clock.now();
        const candidates = drafts.map((draft) =>
            Notification.create({ id: randomUUID(), draft, sourceEventId, now }),
        );
        return this.transactions.run(async () => {
            const inserted = await this.notifications.insertIgnoringDuplicates(candidates);
            await this.events.publish(
                inserted.flatMap((notification) => notification.pullDomainEvents()),
            );
            this.transactions.afterCommit(() => {
                for (const notification of inserted) this.metrics.recordCreated(notification.type);
            });
            return inserted;
        });
    }
}
