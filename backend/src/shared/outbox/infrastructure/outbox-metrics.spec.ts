import { Counter, Gauge, Histogram } from '@prometheus-io/client';
import { describe, expect, it } from 'vitest';
import { OutboxMetricsPort } from '../application/outbox-metrics.port';
import {
    OUTBOX_DELIVERIES_PROCESSED_METRIC,
    OUTBOX_DELIVERY_LAG_METRIC,
    OUTBOX_PENDING_DELIVERIES_METRIC,
    OutboxMetrics,
} from './outbox-metrics';

function createMetrics(): {
    metrics: OutboxMetrics;
    processed: Counter<'subscriber' | 'result'>;
    pending: Gauge<'subscriber'>;
    lag: Histogram<'subscriber'>;
} {
    const processed = new Counter({
        name: OUTBOX_DELIVERIES_PROCESSED_METRIC,
        help: 'test',
        labelNames: ['subscriber', 'result'],
        registers: [],
    });
    const pending = new Gauge({
        name: OUTBOX_PENDING_DELIVERIES_METRIC,
        help: 'test',
        labelNames: ['subscriber'],
        registers: [],
    });
    const lag = new Histogram({
        name: OUTBOX_DELIVERY_LAG_METRIC,
        help: 'test',
        labelNames: ['subscriber'],
        registers: [],
    });
    return { metrics: new OutboxMetrics(processed, pending, lag), processed, pending, lag };
}

describe('OutboxMetrics', () => {
    it('uses the metric names from the design', () => {
        expect(OUTBOX_DELIVERIES_PROCESSED_METRIC).toBe('outbox_deliveries_processed_total');
        expect(OUTBOX_PENDING_DELIVERIES_METRIC).toBe('outbox_pending_deliveries');
        expect(OUTBOX_DELIVERY_LAG_METRIC).toBe('outbox_delivery_lag_seconds');
    });

    it('implements OutboxMetricsPort', () => {
        expect(createMetrics().metrics).toBeInstanceOf(OutboxMetricsPort);
    });

    it('counts processed deliveries by subscriber and result', async () => {
        const { metrics, processed } = createMetrics();

        metrics.recordProcessed('notifications.rule', 'done');
        metrics.recordProcessed('notifications.rule', 'done');
        metrics.recordProcessed('notifications.rule', 'failed');

        const { values } = await processed.get();
        expect(values).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    labels: { subscriber: 'notifications.rule', result: 'done' },
                    value: 2,
                }),
                expect.objectContaining({
                    labels: { subscriber: 'notifications.rule', result: 'failed' },
                    value: 1,
                }),
            ]),
        );
    });

    it('observes the delivery lag per subscriber', async () => {
        const { metrics, lag } = createMetrics();

        metrics.observeDeliveryLag('notifications.rule', 0.25);

        const { values } = await lag.get();
        expect(values).toContainEqual(
            expect.objectContaining({
                metricName: `${OUTBOX_DELIVERY_LAG_METRIC}_count`,
                labels: { subscriber: 'notifications.rule' },
                value: 1,
            }),
        );
    });

    it('sets pending deliveries and resets subscribers that have none left', async () => {
        const { metrics, pending } = createMetrics();

        metrics.setPendingDeliveries(
            new Map([
                ['first', 3],
                ['second', 1],
            ]),
        );
        metrics.setPendingDeliveries(new Map([['first', 2]]));

        const { values } = await pending.get();
        expect(values).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ labels: { subscriber: 'first' }, value: 2 }),
                expect.objectContaining({ labels: { subscriber: 'second' }, value: 0 }),
            ]),
        );
    });
});
