import type { ToolCallTrace } from './ports/sheets-assistant.port';

export interface RunFinishedPayload {
    readonly answer: string;
    readonly toolCalls: readonly ToolCallTrace[];
    readonly durationMs: number;
}

export type AgentEvent =
    | { readonly type: 'run-started' }
    | { readonly type: 'text-delta'; readonly text: string }
    | {
          readonly type: 'tool-call-started';
          readonly callId: string;
          readonly name: string;
          readonly args: unknown;
      }
    | { readonly type: 'tool-call-finished'; readonly callId: string }
    | ({ readonly type: 'run-finished' } & RunFinishedPayload)
    | { readonly type: 'run-failed'; readonly message: string }
    | { readonly type: 'run-cancelled' };

/** Domain language of agent events; independent of AG-UI, LangGraph and SSE. */
export const AgentEvent = {
    runStarted: (): AgentEvent => ({ type: 'run-started' }),
    textDelta: (text: string): AgentEvent => ({ type: 'text-delta', text }),
    toolCallStarted: (callId: string, name: string, args: unknown): AgentEvent => ({
        type: 'tool-call-started',
        callId,
        name,
        args,
    }),
    toolCallFinished: (callId: string): AgentEvent => ({ type: 'tool-call-finished', callId }),
    runFinished: (payload: RunFinishedPayload): AgentEvent => ({
        type: 'run-finished',
        answer: payload.answer,
        toolCalls: payload.toolCalls,
        durationMs: payload.durationMs,
    }),
    runFailed: (message: string): AgentEvent => ({ type: 'run-failed', message }),
    runCancelled: (): AgentEvent => ({ type: 'run-cancelled' }),
    isTerminal: (event: AgentEvent): boolean =>
        event.type === 'run-finished' ||
        event.type === 'run-failed' ||
        event.type === 'run-cancelled',
};
