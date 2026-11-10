import { Injectable } from '@nestjs/common';
import type { Gauge } from '@prometheus-io/client';
import { InjectMetric, makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { RealtimeConnectionMetricsPort } from '../application/ports/realtime-connection-metrics.port';

export const NOTIFICATIONS_WS_CONNECTIONS_METRIC = 'notifications_ws_connections';

export const realtimeConnectionMetricProvider = makeGaugeProvider({
    name: NOTIFICATIONS_WS_CONNECTIONS_METRIC,
    help: 'Open authenticated notification WebSocket connections on this instance',
});

@Injectable()
export class RealtimeConnectionMetrics extends RealtimeConnectionMetricsPort {
    constructor(
        @InjectMetric(NOTIFICATIONS_WS_CONNECTIONS_METRIC)
        private readonly connections: Gauge,
    ) {
        super();
    }

    connectionOpened(): void {
        this.connections.inc();
    }

    connectionClosed(): void {
        this.connections.dec();
    }
}
