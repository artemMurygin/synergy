import { Injectable } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric, makeCounterProvider } from '@willsoto/nestjs-prometheus';
import type { DispatchOutcome } from '../../application/bot-update-dispatcher';
import { TelegramUpdateMetricsPort } from '../../application/ports/telegram-update-metrics.port';

export const TELEGRAM_UPDATES_METRIC = 'telegram_updates_total';

export const telegramUpdatesMetricProvider = makeCounterProvider({
    name: TELEGRAM_UPDATES_METRIC,
    help: 'Received Telegram updates by processing result',
    labelNames: ['result'],
});

@Injectable()
export class TelegramUpdateMetrics extends TelegramUpdateMetricsPort {
    constructor(
        @InjectMetric(TELEGRAM_UPDATES_METRIC) private readonly updates: Counter<'result'>,
    ) {
        super();
    }

    recordUpdate(result: DispatchOutcome): void {
        this.updates.inc({ result });
    }
}
