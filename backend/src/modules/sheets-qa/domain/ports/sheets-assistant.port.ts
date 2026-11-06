import type { AgentEvent } from '../agent-event';
import type { RunInput } from '../run-input';

export interface ToolCallTrace {
    readonly name: string;
    readonly args: unknown;
}

export interface AssistantAnswer {
    readonly answer: string;
    /** Tools the agent called while answering, in order; lets a tester see where the answer came from. */
    readonly toolCalls: readonly ToolCallTrace[];
    readonly durationMs: number;
}

/** Answers a student's question from the exported tables, as a stream of agent events. */
export abstract class SheetsAssistantPort {
    /**
     * Runs the agent in the thread of `input` (the same threadId continues one conversation).
     * Yields events in order and ends with exactly one terminal event
     * (`run-finished`, `run-failed` or `run-cancelled`); errors never escape as exceptions.
     */
    abstract stream(input: RunInput, signal: AbortSignal): AsyncIterable<AgentEvent>;
}
