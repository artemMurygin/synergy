import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { ArgumentOutOfRangeError } from '../../errors';

export const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const DEFAULT_HANDLER_TIMEOUT_MS = 60 * 1000;
export const DEFAULT_PENDING_GAUGE_INTERVAL_MS = 15 * 1000;
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface OutboxSettingsValues {
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
    readonly retentionDays: number;
    readonly claimLeaseMs?: number;
    readonly handlerTimeoutMs?: number;
    readonly pendingGaugeIntervalMs?: number;
    readonly cleanupIntervalMs?: number;
}

export class OutboxSettings {
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
    readonly retentionDays: number;
    readonly claimLeaseMs: number;
    readonly handlerTimeoutMs: number;
    readonly pendingGaugeIntervalMs: number;
    readonly cleanupIntervalMs: number;

    constructor(values: OutboxSettingsValues) {
        this.pollIntervalMs = values.pollIntervalMs;
        this.batchSize = values.batchSize;
        this.maxAttempts = values.maxAttempts;
        this.retentionDays = values.retentionDays;
        this.claimLeaseMs = values.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
        this.handlerTimeoutMs = values.handlerTimeoutMs ?? DEFAULT_HANDLER_TIMEOUT_MS;
        this.pendingGaugeIntervalMs =
            values.pendingGaugeIntervalMs ?? DEFAULT_PENDING_GAUGE_INTERVAL_MS;
        this.cleanupIntervalMs = values.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS;
        if (this.handlerTimeoutMs >= this.claimLeaseMs) {
            throw new ArgumentOutOfRangeError(
                'Outbox handler timeout must be shorter than the claim lease',
                undefined,
                { handlerTimeoutMs: this.handlerTimeoutMs, claimLeaseMs: this.claimLeaseMs },
            );
        }
    }

    static fromConfig(config: ConfigService<Env, true>): OutboxSettings {
        return new OutboxSettings({
            pollIntervalMs: config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }),
            batchSize: config.get('OUTBOX_BATCH_SIZE', { infer: true }),
            maxAttempts: config.get('OUTBOX_MAX_ATTEMPTS', { infer: true }),
            retentionDays: config.get('OUTBOX_RETENTION_DAYS', { infer: true }),
        });
    }
}
