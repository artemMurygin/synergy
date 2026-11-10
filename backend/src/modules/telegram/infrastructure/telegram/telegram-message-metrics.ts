import { Injectable } from '@nestjs/common';
import type { Counter } from '@prometheus-io/client';
import { InjectMetric, makeCounterProvider } from '@willsoto/nestjs-prometheus';
import {
    TelegramMessageMetricsPort,
    type TelegramMessageKind,
    type TelegramSendErrorReason,
} from '../../application/ports/telegram-message-metrics.port';

export const TELEGRAM_MESSAGES_SENT_METRIC = 'telegram_messages_sent_total';
export const TELEGRAM_SEND_ERRORS_METRIC = 'telegram_send_errors_total';

export const telegramMessagesSentMetricProvider = makeCounterProvider({
    name: TELEGRAM_MESSAGES_SENT_METRIC,
    help: 'Telegram messages sent by the bot by kind',
    labelNames: ['kind'],
});

export const telegramSendErrorsMetricProvider = makeCounterProvider({
    name: TELEGRAM_SEND_ERRORS_METRIC,
    help: 'Failed Telegram message sends by reason',
    labelNames: ['reason'],
});

@Injectable()
export class TelegramMessageMetrics extends TelegramMessageMetricsPort {
    constructor(
        @InjectMetric(TELEGRAM_MESSAGES_SENT_METRIC) private readonly sent: Counter<'kind'>,
        @InjectMetric(TELEGRAM_SEND_ERRORS_METRIC) private readonly errors: Counter<'reason'>,
    ) {
        super();
    }

    recordSent(kind: TelegramMessageKind): void {
        this.sent.inc({ kind });
    }

    recordSendError(reason: TelegramSendErrorReason): void {
        this.errors.inc({ reason });
    }
}
