import { Injectable } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric, makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { NotificationCreationMetricsPort } from '../application/ports/notification-creation-metrics.port';
import type { NotificationType } from '../domain/notification-type';

export const NOTIFICATIONS_CREATED_METRIC = 'notifications_created_total';

export const notificationsCreatedMetricProvider = makeCounterProvider({
    name: NOTIFICATIONS_CREATED_METRIC,
    help: 'Created notifications by type',
    labelNames: ['type'],
});

@Injectable()
export class NotificationCreationMetrics extends NotificationCreationMetricsPort {
    constructor(
        @InjectMetric(NOTIFICATIONS_CREATED_METRIC)
        private readonly created: Counter<'type'>,
    ) {
        super();
    }

    recordCreated(type: NotificationType): void {
        this.created.inc({ type });
    }
}
