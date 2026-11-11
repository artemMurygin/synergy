import { AgentEvent } from '../domain/agent-event';
import type { ToolCallTrace } from '../domain/tool-call-trace';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function joinTextParts(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((part: unknown) =>
                isRecord(part) && typeof part.text === 'string' ? part.text : '',
            )
            .join('');
    }
    return '';
}

function messageFieldsOf(message: unknown): Record<string, unknown> | undefined {
    if (!isRecord(message)) return undefined;
    return isRecord(message.kwargs) ? message.kwargs : message;
}

function isSubagentEvent(event: Record<string, unknown>): boolean {
    const agentName = isRecord(event.metadata) ? event.metadata.lc_agent_name : undefined;
    return typeof agentName === 'string' && agentName !== '';
}

function toolCallIdOfEnd(output: unknown): string | undefined {
    if (!isRecord(output)) return undefined;
    const directId = messageFieldsOf(output)?.tool_call_id;
    if (typeof directId === 'string') return directId;
    const messages = isRecord(output.update) ? output.update.messages : undefined;
    if (Array.isArray(messages)) {
        const commandId = messageFieldsOf(messages[0])?.tool_call_id;
        if (typeof commandId === 'string') return commandId;
    }
    return undefined;
}

function toolCallStartedOf(call: unknown): AgentEvent[] {
    if (!isRecord(call) || typeof call.id !== 'string' || typeof call.name !== 'string') {
        return [];
    }
    return [AgentEvent.toolCallStarted(call.id, call.name, call.args)];
}

export function mapStreamEvent(raw: unknown): AgentEvent[] {
    if (!isRecord(raw)) return [];
    const data = isRecord(raw.data) ? raw.data : undefined;
    switch (raw.event) {
        case 'on_chat_model_stream': {
            if (isSubagentEvent(raw)) return [];
            const text = joinTextParts(messageFieldsOf(data?.chunk)?.content);
            return text === '' ? [] : [AgentEvent.textDelta(text)];
        }
        case 'on_chat_model_end': {
            const toolCalls = messageFieldsOf(data?.output)?.tool_calls;
            if (!Array.isArray(toolCalls)) return [];
            return toolCalls.flatMap((call: unknown) => toolCallStartedOf(call));
        }
        case 'on_tool_end': {
            const callId = toolCallIdOfEnd(data?.output);
            return callId === undefined ? [] : [AgentEvent.toolCallFinished(callId)];
        }
        default:
            return [];
    }
}

export class StreamEventMapper {
    private readonly startedAt: number;
    private answer = '';
    private readonly toolCalls: ToolCallTrace[] = [];

    constructor(private readonly now: () => number = () => performance.now()) {
        this.startedAt = now();
    }

    map(raw: unknown): AgentEvent[] {
        const events = mapStreamEvent(raw);
        for (const event of events) {
            if (event.type === 'text-delta') this.answer += event.text;
            else if (event.type === 'tool-call-started') {
                this.toolCalls.push({ name: event.name, args: event.args });
            }
        }
        return events;
    }

    finish(): AgentEvent {
        return AgentEvent.runFinished({
            answer: this.answer,
            toolCalls: [...this.toolCalls],
            durationMs: Math.round(this.now() - this.startedAt),
        });
    }
}
