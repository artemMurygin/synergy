import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema';
import { createChatModel } from './create-chat-model';

function configOf(values: Record<string, unknown>): ConfigService<Env, true> {
    const config: Pick<ConfigService, 'get'> = { get: (key: string) => values[key] };
    return config as ConfigService<Env, true>;
}

describe('createChatModel', () => {
    it('builds an omniroute model with the timeout and the retry limit from the config', () => {
        const model = createChatModel(
            configOf({
                OPENAI_API_KEY: 'key',
                OPENAI_TIMEOUT_MS: 12_000,
                OPENAI_MAX_RETRIES: 3,
            }),
            { name: 'gpt-x', provider: 'omniroute' },
        );

        expect(model.model).toBe('gpt-x');
        expect(model.timeout).toBe(12_000);
        expect(model.lc_kwargs).toMatchObject({ maxRetries: 3 });
    });

    it('requires the OpenRouter key for an openrouter model', () => {
        expect(() =>
            createChatModel(configOf({}), { name: 'anthropic/x', provider: 'openrouter' }),
        ).toThrow('OPENROUTER_API_KEY');
    });
});
