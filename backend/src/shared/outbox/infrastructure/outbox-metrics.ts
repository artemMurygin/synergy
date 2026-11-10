import { Injectable } from '@nestjs/common';
import {
    InjectMetric,
    makeCounterProvider,
    makeGaugeProvider,
    makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import type { Counter, Gauge, Histogram } from '@prometheus-io/client';
import { OutboxMetricsPort, type OutboxDeliveryResult } from '../application/outbox-metrics.port';

export const OUTBOX_DELIVERIES_PROCESSED_METRIC = 'outbox_deliveries_processed_total';
export const OUTBOX_PENDING_DELIVERIES_METRIC = 'outbox_pending_deliveries';
export const OUTBOX_DELIVERY_LAG_METRIC = 'outbox_delivery_lag_seconds';

const DELIVERY_LAG_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 300, 900, 3600];

export const outboxMetricProviders = [
    makeCounterProvider({
        name: OUTBOX_DELIVERIES_PROCESSED_METRIC,
        help: 'Outbox deliveries processed by subscriber and result',
        labelNames: ['subscriber', 'result'],
    }),
    makeGaugeProvider({
        name: OUTBOX_PENDING_DELIVERIES_METRIC,
        help: 'Outbox deliveries waiting to be processed by subscriber',
        labelNames: ['subscriber'],
    }),
    makeHistogramProvider({
        name: OUTBOX_DELIVERY_LAG_METRIC,
        help: 'Seconds from outbox event creation to successful delivery',
        labelNames: ['subscriber'],
        buckets: DELIVERY_LAG_BUCKETS_SECONDS,
    }),
];

@Injectable()
export class OutboxMetrics extends OutboxMetricsPort {
    private readonly reportedSubscribers = new Set<string>();

    constructor(
        @InjectMetric(OUTBOX_DELIVERIES_PROCESSED_METRIC)
        private readonly processedDeliveries: Counter<'subscriber' | 'result'>,
        @InjectMetric(OUTBOX_PENDING_DELIVERIES_METRIC)
        private readonly pendingDeliveries: Gauge<'subscriber'>,
        @InjectMetric(OUTBOX_DELIVERY_LAG_METRIC)
        private readonly deliveryLag: Histogram<'subscriber'>,
    ) {
        super();
    }

    recordProcessed(subscriber: string, result: OutboxDeliveryResult): void {
        this.processedDeliveries.inc({ subscriber, result });
    }

    observeDeliveryLag(subscriber: string, lagSeconds: number): void {
        this.deliveryLag.observe({ subscriber }, lagSeconds);
    }

    setPendingDeliveries(pendingBySubscriber: ReadonlyMap<string, number>): void {
        for (const subscriber of this.reportedSubscribers) {
            if (!pendingBySubscriber.has(subscriber)) {
                this.pendingDeliveries.set({ subscriber }, 0);
            }
        }
        for (const [subscriber, count] of pendingBySubscriber) {
            this.reportedSubscribers.add(subscriber);
            this.pendingDeliveries.set({ subscriber }, count);
        }
    }
}
