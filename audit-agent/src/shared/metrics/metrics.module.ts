import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { makeHistogramProvider, PrometheusModule } from '@willsoto/nestjs-prometheus';
import { HTTP_REQUEST_DURATION_METRIC, HttpMetricsMiddleware } from './http-metrics.middleware';

const HTTP_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Module({
    imports: [
        PrometheusModule.register({
            path: '/metrics',
            defaultMetrics: { enabled: true },
        }),
    ],
    providers: [
        HttpMetricsMiddleware,
        makeHistogramProvider({
            name: HTTP_REQUEST_DURATION_METRIC,
            help: 'HTTP request duration in seconds',
            labelNames: ['method', 'route', 'status_code'],
            buckets: HTTP_DURATION_BUCKETS_SECONDS,
        }),
    ],
})
export class MetricsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(HttpMetricsMiddleware)
            .exclude('metrics', 'health')
            .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
}
