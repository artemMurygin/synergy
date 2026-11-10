import { Counter } from '@prometheus-io/client';
import { describe, expect, it } from 'vitest';
import { TELEGRAM_UPDATES_METRIC, TelegramUpdateMetrics } from './telegram-update-metrics';

describe('TelegramUpdateMetrics', () => {
    it('counts received updates by result under the design name', async () => {
        const updates = new Counter({
            name: TELEGRAM_UPDATES_METRIC,
            help: 'test',
            labelNames: ['result'],
            registers: [],
        });
        const metrics = new TelegramUpdateMetrics(updates);

        metrics.recordUpdate('handled');
        metrics.recordUpdate('handled');
        metrics.recordUpdate('duplicate');

        expect(TELEGRAM_UPDATES_METRIC).toBe('telegram_updates_total');
        const { values } = await updates.get();
        expect(values).toEqual([
            expect.objectContaining({ labels: { result: 'handled' }, value: 2 }),
            expect.objectContaining({ labels: { result: 'duplicate' }, value: 1 }),
        ]);
    });
});
