import type { ToolCallTrace } from '../domain/tool-call-trace';

/**
 * Tool calls of the model messages in a run, in order. `durations` (call id to milliseconds,
 * measured from the start of a call to its end) go into the trace; a call without one has none.
 */
export function collectToolCalls(
    messages: readonly unknown[],
    durations: ReadonlyMap<string, number> = new Map(),
): ToolCallTrace[] {
    const calls: ToolCallTrace[] = [];
    for (const message of messages) {
        if (typeof message !== 'object' || message === null || !('tool_calls' in message)) continue;
        const toolCalls = message.tool_calls;
        if (!Array.isArray(toolCalls)) continue;
        for (const call of toolCalls) {
            const entry: unknown = call;
            if (typeof entry !== 'object' || entry === null || !('name' in entry)) continue;
            const durationMs =
                'id' in entry && typeof entry.id === 'string' ? durations.get(entry.id) : undefined;
            calls.push({
                name: String(entry.name),
                args: 'args' in entry ? entry.args : undefined,
                ...(durationMs === undefined ? {} : { durationMs }),
            });
        }
    }
    return calls;
}
