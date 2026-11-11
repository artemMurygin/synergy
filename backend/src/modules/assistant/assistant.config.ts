import type { ChatModelSetting } from '../../shared/llm';

/** How the chat model of the orchestrator is reached. */
export type OrchestratorModelSetting = ChatModelSetting;

export const ASSISTANT_CONFIG = {
    /** The orchestrator only routes between capabilities, so a small fast model is enough. */
    model: {
        name: 'anthropic/claude-haiku-5.5',
        provider: 'openrouter',
        reasoningEffort: 'low',
        promptCache: true,
    },
    /** Step limit (LangGraph recursion limit) of one run, nested subagents included. */
    maxSteps: 60,
    /** Time limit for one run, ms. */
    timeoutMs: 180_000,
} as const satisfies {
    model: OrchestratorModelSetting;
    maxSteps: number;
    timeoutMs: number;
};
