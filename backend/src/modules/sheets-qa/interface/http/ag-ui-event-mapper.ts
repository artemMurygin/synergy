import { EventType, type BaseEvent } from '@ag-ui/core';
import type { AgentEvent } from '../../domain/agent-event';

export interface AgUiRunContext {
    readonly threadId: string;
    readonly runId: string;
}

/**
 * Converts the domain events of one run to AG-UI events. Stateful: it opens and closes
 * text messages and tool calls so that the emitted stream is always well-formed.
 */
export class AgUiEventMapper {
    private messageCount = 0;
    private openMessageId: string | null = null;
    private readonly openToolCalls = new Set<string>();

    constructor(private readonly context: AgUiRunContext) {}

    map(event: AgentEvent): BaseEvent[] {
        switch (event.type) {
            case 'run-started':
                return [{ type: EventType.RUN_STARTED, ...this.context }];
            case 'text-delta':
                return this.text(event.text);
            case 'tool-call-started':
                return this.toolCallStarted(event.callId, event.name, event.args);
            case 'tool-call-finished':
                return this.toolCallFinished(event.callId);
            case 'run-finished':
                return [
                    ...(this.openMessageId === null && event.answer.length > 0
                        ? this.text(event.answer)
                        : []),
                    ...this.closeAll(),
                    { type: EventType.RUN_FINISHED, ...this.context },
                ];
            case 'run-failed':
                return [...this.closeAll(), { type: EventType.RUN_ERROR, message: event.message }];
            case 'run-cancelled':
                return [
                    ...this.closeAll(),
                    {
                        type: EventType.RUN_FINISHED,
                        ...this.context,
                        outcome: { type: 'cancelled' },
                    },
                ];
        }
    }

    private text(delta: string): BaseEvent[] {
        if (delta.length === 0) return [];
        const events: BaseEvent[] = [];
        if (this.openMessageId === null) {
            this.openMessageId = `${this.context.runId}-message-${String(this.messageCount++)}`;
            events.push({
                type: EventType.TEXT_MESSAGE_START,
                messageId: this.openMessageId,
                role: 'assistant',
            });
        }
        events.push({
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: this.openMessageId,
            delta,
        });
        return events;
    }

    private toolCallStarted(callId: string, name: string, args: unknown): BaseEvent[] {
        this.openToolCalls.add(callId);
        return [
            ...this.closeText(),
            {
                type: EventType.TOOL_CALL_START,
                toolCallId: callId,
                toolCallName: name,
            },
            {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: callId,
                delta: JSON.stringify(args ?? {}),
            },
        ];
    }

    private toolCallFinished(callId: string): BaseEvent[] {
        if (!this.openToolCalls.delete(callId)) return [];
        return [{ type: EventType.TOOL_CALL_END, toolCallId: callId }, this.toolCallResult(callId)];
    }

    /** Tool output may hold data hidden from the user, so only a completion marker is sent. */
    private toolCallResult(callId: string): BaseEvent {
        return {
            type: EventType.TOOL_CALL_RESULT,
            messageId: `${callId}-result`,
            toolCallId: callId,
            content: '',
            role: 'tool',
        };
    }

    private closeText(): BaseEvent[] {
        if (this.openMessageId === null) return [];
        const messageId = this.openMessageId;
        this.openMessageId = null;
        return [{ type: EventType.TEXT_MESSAGE_END, messageId }];
    }

    /** Before a terminal event: calls still open end without a result, the open text ends. */
    private closeAll(): BaseEvent[] {
        const events = this.closeText();
        for (const callId of this.openToolCalls) {
            events.push({ type: EventType.TOOL_CALL_END, toolCallId: callId });
        }
        this.openToolCalls.clear();
        return events;
    }
}
