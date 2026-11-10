import { Counter, Gauge } from '@prometheus-io/client';
import { describe, expect, it } from 'vitest';
import {
    NOTIFICATION_CHANNEL_FAILURES_METRIC,
    NotificationChannelMetrics,
} from './notification-channel-metrics';
import {
    NOTIFICATIONS_WS_CONNECTIONS_METRIC,
    RealtimeConnectionMetrics,
} from './realtime-connection-metrics';

describe('NotificationChannelMetrics', () => {
    it('counts failures by channel under the design name', async () => {
        const failures = new Counter({
            name: NOTIFICATION_CHANNEL_FAILURES_METRIC,
            help: 'test',
            labelNames: ['channel'],
            registers: [],
        });
        const metrics = new NotificationChannelMetrics(failures);

        metrics.recordFailure('realtime');
        metrics.recordFailure('realtime');

        expect(NOTIFICATION_CHANNEL_FAILURES_METRIC).toBe('notification_channel_failures_total');
        const { values } = await failures.get();
        expect(values).toEqual([
            expect.objectContaining({ labels: { channel: 'realtime' }, value: 2 }),
        ]);
    });
});

describe('RealtimeConnectionMetrics', () => {
    it('tracks open connections under the design name', async () => {
        const connections = new Gauge({
            name: NOTIFICATIONS_WS_CONNECTIONS_METRIC,
            help: 'test',
            registers: [],
        });
        const metrics = new RealtimeConnectionMetrics(connections);

        metrics.connectionOpened();
        metrics.connectionOpened();
        metrics.connectionClosed();

        expect(NOTIFICATIONS_WS_CONNECTIONS_METRIC).toBe('notifications_ws_connections');
        const { values } = await connections.get();
        expect(values).toEqual([expect.objectContaining({ value: 1 })]);
    });
});
