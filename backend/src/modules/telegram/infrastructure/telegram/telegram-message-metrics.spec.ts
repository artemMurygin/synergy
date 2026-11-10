import { Counter } from '@prometheus-io/client';
import { describe, expect, it } from 'vitest';
import {
    TELEGRAM_MESSAGES_SENT_METRIC,
    TELEGRAM_SEND_ERRORS_METRIC,
    TelegramMessageMetrics,
} from './telegram-message-metrics';

describe('TelegramMessageMetrics', () => {
    it('counts sent messages by kind and send errors by reason under the design names', async () => {
        const sent = new Counter({
            name: TELEGRAM_MESSAGES_SENT_METRIC,
            help: 'test',
            labelNames: ['kind'],
            registers: [],
        });
        const errors = new Counter({
            name: TELEGRAM_SEND_ERRORS_METRIC,
            help: 'test',
            labelNames: ['reason'],
            registers: [],
        });
        const metrics = new TelegramMessageMetrics(sent, errors);

        metrics.recordSent('notification');
        metrics.recordSent('notification');
        metrics.recordSent('reply');
        metrics.recordSendError('rate_limited');

        expect(TELEGRAM_MESSAGES_SENT_METRIC).toBe('telegram_messages_sent_total');
        expect(TELEGRAM_SEND_ERRORS_METRIC).toBe('telegram_send_errors_total');
        expect((await sent.get()).values).toEqual([
            expect.objectContaining({ labels: { kind: 'notification' }, value: 2 }),
            expect.objectContaining({ labels: { kind: 'reply' }, value: 1 }),
        ]);
        expect((await errors.get()).values).toEqual([
            expect.objectContaining({ labels: { reason: 'rate_limited' }, value: 1 }),
        ]);
    });
});
