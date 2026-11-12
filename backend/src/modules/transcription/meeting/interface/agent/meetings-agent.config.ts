import type { ChatModelSetting } from '../../../../../shared/llm';

/** Модель специалиста по встречам. Ключ OpenRouter — в env (OPENROUTER_API_KEY). */
export const MEETINGS_AGENT_CONFIG: { readonly model: ChatModelSetting } = {
    model: {
        name: 'anthropic/claude-haiku-5.5',
        provider: 'openrouter',
        reasoningEffort: 'low',
        promptCache: true,
    },
};
