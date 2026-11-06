import type { ToolCallTrace } from '../domain/tool-call-trace';

/** Tool calls of the model messages in a run, in order. */
export function collectToolCalls(messages: readonly unknown[]): ToolCallTrace[] {
    const calls: ToolCallTrace[] = [];
    for (const message of messages) {
        if (typeof message !== 'object' || message === null || !('tool_calls' in message)) continue;
        const toolCalls = message.tool_calls;
        if (!Array.isArray(toolCalls)) continue;
        for (const call of toolCalls as unknown[]) {
            if (typeof call !== 'object' || call === null || !('name' in call)) continue;
            calls.push({
                name: String(call.name),
                args: 'args' in call ? call.args : undefined,
            });
        }
    }
    return calls;
}
