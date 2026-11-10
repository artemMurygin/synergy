import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import type { Env } from '../config/env.schema';

export interface RealtimeSettingsValues {
    readonly allowedOrigins: readonly string[];
    readonly pingIntervalMs: number;
}

export class RealtimeSettings {
    readonly allowedOrigins: readonly string[];
    readonly pingIntervalMs: number;

    constructor(values: RealtimeSettingsValues) {
        this.allowedOrigins = values.allowedOrigins;
        this.pingIntervalMs = values.pingIntervalMs;
    }

    static fromConfig(config: ConfigService<Env, true>): RealtimeSettings {
        return new RealtimeSettings({
            allowedOrigins: config.get('AUTH_ALLOWED_ORIGINS', { infer: true }),
            pingIntervalMs: config.get('NOTIFICATIONS_WS_PING_INTERVAL_MS', { infer: true }),
        });
    }
}

export function realtimeRedisOptions(config: ConfigService<Env, true>): RedisOptions {
    const password = config.get('REDIS_PASSWORD', { infer: true });
    return {
        host: config.get('REDIS_HOST', { infer: true }),
        port: config.get('REDIS_PORT', { infer: true }),
        db: config.get('REDIS_DB', { infer: true }),
        ...(password === undefined ? {} : { password }),
    };
}
