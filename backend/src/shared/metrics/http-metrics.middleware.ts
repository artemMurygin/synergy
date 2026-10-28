import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Histogram } from '@prometheus-io/client';

export const HTTP_REQUEST_DURATION_METRIC = 'http_request_duration_seconds';

const UNMATCHED_ROUTE = 'unmatched';
const CATCH_ALL_ROUTE = '/{*path}';
const NANOSECONDS_IN_SECOND = 1e9;

type RoutedRequest = IncomingMessage & { route?: { path?: unknown } };

function resolveRoute(req: RoutedRequest): string {
    const path = req.route?.path;
    return typeof path === 'string' && path !== CATCH_ALL_ROUTE ? path : UNMATCHED_ROUTE;
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
    constructor(
        @InjectMetric(HTTP_REQUEST_DURATION_METRIC)
        private readonly requestDuration: Histogram<'method' | 'route' | 'status_code'>,
    ) {}

    use(req: RoutedRequest, res: ServerResponse, next: () => void): void {
        const startedAt = process.hrtime.bigint();
        res.on('finish', () => {
            const durationSeconds =
                Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_IN_SECOND;
            this.requestDuration.observe(
                {
                    method: req.method ?? 'UNKNOWN',
                    route: resolveRoute(req),
                    status_code: String(res.statusCode),
                },
                durationSeconds,
            );
        });
        next();
    }
}
