import type { ChatModelSetting } from '../../shared/llm';

/** Settings of the tasks agent. The OpenRouter key stays in env (OPENROUTER_API_KEY). */
export const TASKS_AGENT_CONFIG: { readonly model: ChatModelSetting } = {
    model: {
        name: 'anthropic/claude-haiku-5.5',
        provider: 'openrouter',
        reasoningEffort: 'low',
        promptCache: true,
    },
};
