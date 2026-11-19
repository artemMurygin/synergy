import type { AgentEvent } from '../agent-event';
import type { ClientId } from '../client-id';
import type { RunInput } from '../run-input';
import type { ToolCallTrace } from '../tool-call-trace';

export interface AssistantAnswer {
    readonly answer: string;
    readonly toolCalls: readonly ToolCallTrace[];
    readonly durationMs: number;
    /** Ids of the files the agent attached to the answer, in the order of attaching. */
    readonly attachments?: readonly string[];
}

/** Who runs the agent and through which client; never taken from the question or the model. */
export interface AgentRunScope {
    readonly userId: string;
    readonly client: ClientId;
    /** Continue the agent context from this checkpoint (a fork), dropping what came after it. */
    readonly fromCheckpointId?: string;
}

export abstract class AgentRunnerPort {
    abstract stream(
        input: RunInput,
        signal: AbortSignal,
        scope: AgentRunScope,
    ): AsyncIterable<AgentEvent>;
}
