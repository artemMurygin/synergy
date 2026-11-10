import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';

export const DEFAULT_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface OutboxSettingsValues {
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
    readonly retentionDays: number;
    readonly claimLeaseMs?: number;
    readonly cleanupIntervalMs?: number;
}

export class OutboxSettings {
    readonly pollIntervalMs: number;
    readonly batchSize: number;
    readonly maxAttempts: number;
    readonly retentionDays: number;
    readonly claimLeaseMs: number;
    readonly cleanupIntervalMs: number;

    constructor(values: OutboxSettingsValues) {
        this.pollIntervalMs = values.pollIntervalMs;
        this.batchSize = values.batchSize;
        this.maxAttempts = values.maxAttempts;
        this.retentionDays = values.retentionDays;
        this.claimLeaseMs = values.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
        this.cleanupIntervalMs = values.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS;
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
