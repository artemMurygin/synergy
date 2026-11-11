import type { AgentEvent } from '../agent-event';
import type { ClientId } from '../client-id';
import type { RunInput } from '../run-input';
import type { ToolCallTrace } from '../tool-call-trace';

export interface AssistantAnswer {
    readonly answer: string;
    readonly toolCalls: readonly ToolCallTrace[];
    readonly durationMs: number;
}

/** Who runs the agent and through which client; never taken from the question or the model. */
export interface AgentRunScope {
    readonly userId: string;
    readonly client: ClientId;
}

export abstract class AgentRunnerPort {
    abstract stream(
        input: RunInput,
        signal: AbortSignal,
        scope: AgentRunScope,
    ): AsyncIterable<AgentEvent>;
}
