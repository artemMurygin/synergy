import { describe, expect, it } from 'vitest';
import { ArgumentOutOfRangeError } from '../../errors';
import { OutboxSettings } from './outbox-settings';

const base = { pollIntervalMs: 1000, batchSize: 10, maxAttempts: 3, retentionDays: 7 };

describe('OutboxSettings', () => {
    it('keeps the default handler timeout shorter than the default lease', () => {
        const settings = new OutboxSettings(base);

        expect(settings.handlerTimeoutMs).toBeLessThan(settings.claimLeaseMs);
    });

    it('rejects a handler timeout that does not fit into the claim lease', () => {
        expect(
            () => new OutboxSettings({ ...base, claimLeaseMs: 10_000, handlerTimeoutMs: 10_000 }),
        ).toThrow(ArgumentOutOfRangeError);
    });
});
