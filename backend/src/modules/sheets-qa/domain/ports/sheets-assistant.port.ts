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

/** Answers a student's question from the exported tables. */
export abstract class SheetsAssistantPort {
    /** Questions with the same sessionId continue one conversation. */
    abstract ask(question: string, sessionId: string): Promise<AssistantAnswer>;
}
