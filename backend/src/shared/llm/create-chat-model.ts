import { ChatOpenAI } from '@langchain/openai';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/** How a chat model is reached. */
export interface ChatModelSetting {
    readonly name: string;
    /** `omniroute` uses OPENAI_BASE_URL and OPENAI_API_KEY, `openrouter` uses OPENROUTER_API_KEY. */
    readonly provider: 'omniroute' | 'openrouter';
    /** OpenRouter only: reasoning effort; low keeps the answers fast. */
    readonly reasoningEffort?: 'low' | 'medium' | 'high';
    /** OpenRouter only: Anthropic prompt caching, adds top-level `cache_control`. */
    readonly promptCache?: boolean;
}

/** Creates the chat model of a setting from the OpenAI-compatible or OpenRouter endpoint. */
export function createChatModel(
    config: ConfigService<Env, true>,
    setting: ChatModelSetting,
): ChatOpenAI {
    if (setting.provider === 'omniroute') {
        const baseURL = config.get('OPENAI_BASE_URL', { infer: true });
        return new ChatOpenAI({
            model: setting.name,
            apiKey: config.get('OPENAI_API_KEY', { infer: true }),
            temperature: 0,
            timeout: config.get('OPENAI_TIMEOUT_MS', { infer: true }),
            maxRetries: config.get('OPENAI_MAX_RETRIES', { infer: true }),
            ...(baseURL === undefined ? {} : { configuration: { baseURL } }),
        });
    }
    const openRouterKey = config.get('OPENROUTER_API_KEY', { infer: true });
    if (openRouterKey === undefined) {
        throw new Error(`OPENROUTER_API_KEY is required for model ${setting.name}`);
    }
    return new ChatOpenAI({
        model: setting.name,
        apiKey: openRouterKey,
        temperature: 0,
        configuration: { baseURL: config.get('OPENROUTER_BASE_URL', { infer: true }) },
        modelKwargs: {
            provider: { sort: 'throughput' },
            ...(setting.reasoningEffort === undefined
                ? {}
                : { reasoning: { effort: setting.reasoningEffort } }),
            ...(setting.promptCache === true ? { cache_control: { type: 'ephemeral' } } : {}),
        },
    });
}
