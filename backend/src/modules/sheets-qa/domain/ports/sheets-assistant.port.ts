import type { AgentEvent } from '../agent-event';
import type { RunInput } from '../run-input';
import type { ToolCallTrace } from '../tool-call-trace';

export interface AssistantAnswer {
    readonly answer: string;
    readonly toolCalls: readonly ToolCallTrace[];
    readonly durationMs: number;
}

export abstract class SheetsAssistantPort {
    abstract stream(input: RunInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}
