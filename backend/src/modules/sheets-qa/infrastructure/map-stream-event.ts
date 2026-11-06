import { AgentEvent } from '../domain/agent-event';
import type { ToolCallTrace } from '../domain/ports/sheets-assistant.port';

type Obj = Record<string, unknown>;

function asObj(value: unknown): Obj | undefined {
    return typeof value === 'object' && value !== null ? (value as Obj) : undefined;
}

function textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((part: unknown) => {
                const p = asObj(part);
                return p !== undefined && typeof p.text === 'string' ? p.text : '';
            })
            .join('');
    }
    return '';
}

/** Events of subagents carry `lc_agent_name`; the top-level agent has none. */
function isSubagent(event: Obj): boolean {
    const name = asObj(event.metadata)?.lc_agent_name;
    return typeof name === 'string' && name !== '';
}

function toolCallIdOfEnd(output: unknown): string | undefined {
    const out = asObj(output);
    if (out === undefined) return undefined;
    // Plain tool: ToolMessage.
    const direct = asObj(out.kwargs)?.tool_call_id;
    if (typeof direct === 'string') return direct;
    // `task` returns a Command with the ToolMessage inside `update.messages`.
    const messages = asObj(out.update)?.messages;
    if (Array.isArray(messages)) {
        const id = asObj(asObj(messages[0])?.kwargs)?.tool_call_id;
        if (typeof id === 'string') return id;
    }
    return undefined;
}

/**
 * Pure translation of one LangGraph `streamEvents` (v2) event into AgentEvents.
 * Text comes only from the top-level agent; tool results are never forwarded.
 */
export function mapStreamEvent(raw: unknown): AgentEvent[] {
    const event = asObj(raw);
    if (event === undefined) return [];
    const data = asObj(event.data);
    switch (event.event) {
        case 'on_chat_model_stream': {
            if (isSubagent(event)) return [];
            const text = textOf(asObj(asObj(data?.chunk)?.kwargs)?.content);
            return text === '' ? [] : [AgentEvent.textDelta(text)];
        }
        case 'on_chat_model_end': {
            const calls = asObj(asObj(data?.output)?.kwargs)?.tool_calls;
            if (!Array.isArray(calls)) return [];
            const events: AgentEvent[] = [];
            for (const call of calls as unknown[]) {
                const c = asObj(call);
                if (c === undefined || typeof c.id !== 'string' || typeof c.name !== 'string') {
                    continue;
                }
                events.push(AgentEvent.toolCallStarted(c.id, c.name, c.args));
            }
            return events;
        }
        case 'on_tool_end': {
            const callId = toolCallIdOfEnd(data?.output);
            return callId === undefined ? [] : [AgentEvent.toolCallFinished(callId)];
        }
        default:
            return [];
    }
}

/** Maps a run's stream and builds the final `run-finished` (answer, tool calls, duration). */
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
