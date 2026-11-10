import { Injectable } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric, makeCounterProvider } from '@willsoto/nestjs-prometheus';
import { NotificationChannelMetricsPort } from '../application/ports/notification-channel-metrics.port';

export const NOTIFICATION_CHANNEL_FAILURES_METRIC = 'notification_channel_failures_total';

export const notificationChannelFailuresMetricProvider = makeCounterProvider({
    name: NOTIFICATION_CHANNEL_FAILURES_METRIC,
    help: 'Failed notification deliveries by channel',
    labelNames: ['channel'],
});

@Injectable()
export class NotificationChannelMetrics extends NotificationChannelMetricsPort {
    constructor(
        @InjectMetric(NOTIFICATION_CHANNEL_FAILURES_METRIC)
        private readonly failures: Counter<'channel'>,
    ) {
        super();
    }

    recordFailure(channel: string): void {
        this.failures.inc({ channel });
    }
}
