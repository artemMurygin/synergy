import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../../shared/config/env.schema';
import { createTelegramRedis } from './telegram-redis.provider';

describe('createTelegramRedis', () => {
    it('logs a client failure through pino with the error under err and a constant message', () => {
        const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
        const error = vi.spyOn(logger, 'error');
        const config = new ConfigService<Env, true>({
            REDIS_HOST: '127.0.0.1',
            REDIS_PORT: 6399,
            REDIS_PASSWORD: undefined,
            REDIS_DB: 0,
        });
        const client = createTelegramRedis(config, logger);
        const failure = new Error('connect ECONNREFUSED 127.0.0.1:6399');

        client.emit('error', failure);
        client.disconnect();

        expect(error).toHaveBeenCalledWith({ err: failure }, 'Telegram Redis client failed');
    });
});
