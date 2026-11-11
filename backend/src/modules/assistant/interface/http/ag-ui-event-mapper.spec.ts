import { EventType } from '@ag-ui/core';
import { describe, expect, it } from 'vitest';
import { AgentEvent } from '../../domain/agent-event';
import { AgUiEventMapper } from './ag-ui-event-mapper';

function newMapper(): AgUiEventMapper {
    return new AgUiEventMapper({ threadId: 'thread-1', runId: 'run-1' });
}

function types(events: readonly { type: EventType }[]): EventType[] {
    return events.map((event) => event.type);
}

describe('AgUiEventMapper', () => {
    it('maps run-started to RUN_STARTED with the thread and run ids', () => {
        expect(newMapper().map(AgentEvent.runStarted())).toEqual([
            { type: EventType.RUN_STARTED, threadId: 'thread-1', runId: 'run-1' },
        ]);
    });

    it('opens a text message on the first delta and streams the following ones into it', () => {
        const mapper = newMapper();
        const first = mapper.map(AgentEvent.textDelta('При'));
        const second = mapper.map(AgentEvent.textDelta('вет'));

        expect(types(first)).toEqual([
            EventType.TEXT_MESSAGE_START,
            EventType.TEXT_MESSAGE_CONTENT,
        ]);
        expect(types(second)).toEqual([EventType.TEXT_MESSAGE_CONTENT]);
        const start = first[0] as unknown as { messageId: string; role: string };
        expect(start.role).toBe('assistant');
        expect(first[1]).toMatchObject({ messageId: start.messageId, delta: 'При' });
        expect(second[0]).toMatchObject({ messageId: start.messageId, delta: 'вет' });
    });

    it('skips empty text deltas', () => {
        expect(newMapper().map(AgentEvent.textDelta(''))).toEqual([]);
    });

    it('maps a tool call to START, ARGS (JSON), END and an empty RESULT, closing the open text first', () => {
        const mapper = newMapper();
        mapper.map(AgentEvent.textDelta('Сейчас проверю. '));

        const started = mapper.map(
            AgentEvent.toolCallStarted('call-1', 'search_rows', { query: 'МВА' }),
        );
        expect(types(started)).toEqual([
            EventType.TEXT_MESSAGE_END,
            EventType.TOOL_CALL_START,
            EventType.TOOL_CALL_ARGS,
        ]);
        expect(started[1]).toMatchObject({ toolCallId: 'call-1', toolCallName: 'search_rows' });
        expect(started[2]).toMatchObject({
            toolCallId: 'call-1',
            delta: JSON.stringify({ query: 'МВА' }),
        });

        const finished = mapper.map(AgentEvent.toolCallFinished('call-1'));
        expect(types(finished)).toEqual([EventType.TOOL_CALL_END, EventType.TOOL_CALL_RESULT]);
        expect(finished[0]).toMatchObject({ toolCallId: 'call-1' });
        // Tool output may hold data hidden from the user: only a completion marker goes out.
        expect(finished[1]).toMatchObject({ toolCallId: 'call-1', content: '', role: 'tool' });
    });

    it('starts a new text message after a tool call', () => {
        const mapper = newMapper();
        const first = mapper.map(AgentEvent.textDelta('a'));
        mapper.map(AgentEvent.toolCallStarted('c', 't', {}));
        mapper.map(AgentEvent.toolCallFinished('c'));
        const next = mapper.map(AgentEvent.textDelta('b'));
        expect(types(next)).toEqual([EventType.TEXT_MESSAGE_START, EventType.TEXT_MESSAGE_CONTENT]);
        expect((next[0] as unknown as { messageId: string }).messageId).not.toBe(
            (first[0] as unknown as { messageId: string }).messageId,
        );
    });

    it('ignores the end of an unknown tool call', () => {
        expect(newMapper().map(AgentEvent.toolCallFinished('nope'))).toEqual([]);
    });

    it('finishes the run: closes the text message and emits RUN_FINISHED', () => {
        const mapper = newMapper();
        mapper.map(AgentEvent.textDelta('Ответ'));
        const events = mapper.map(
            AgentEvent.runFinished({ answer: 'Ответ', toolCalls: [], durationMs: 5 }),
        );
        expect(types(events)).toEqual([EventType.TEXT_MESSAGE_END, EventType.RUN_FINISHED]);
        expect(events[1]).toEqual({
            type: EventType.RUN_FINISHED,
            threadId: 'thread-1',
            runId: 'run-1',
        });
    });

    it('sends the answer as a message when nothing was streamed before the finish', () => {
        const events = newMapper().map(
            AgentEvent.runFinished({ answer: 'Готово', toolCalls: [], durationMs: 5 }),
        );
        expect(types(events)).toEqual([
            EventType.TEXT_MESSAGE_START,
            EventType.TEXT_MESSAGE_CONTENT,
            EventType.TEXT_MESSAGE_END,
            EventType.RUN_FINISHED,
        ]);
        expect(events[1]).toMatchObject({ delta: 'Готово' });
    });

    it('maps run-failed to RUN_ERROR with the message, closing open text and tool calls', () => {
        const mapper = newMapper();
        mapper.map(AgentEvent.textDelta('часть'));
        mapper.map(AgentEvent.toolCallStarted('c', 't', {}));
        const events = mapper.map(AgentEvent.runFailed('Превышено время'));
        expect(types(events)).toEqual([EventType.TOOL_CALL_END, EventType.RUN_ERROR]);
        expect(events[1]).toMatchObject({ message: 'Превышено время' });
    });

    it('closes an open text message before RUN_ERROR', () => {
        const mapper = newMapper();
        mapper.map(AgentEvent.textDelta('часть'));
        expect(types(mapper.map(AgentEvent.runFailed('сбой')))).toEqual([
            EventType.TEXT_MESSAGE_END,
            EventType.RUN_ERROR,
        ]);
    });

    it('maps run-cancelled to RUN_FINISHED with the cancelled outcome', () => {
        const mapper = newMapper();
        mapper.map(AgentEvent.textDelta('часть'));
        const events = mapper.map(AgentEvent.runCancelled());
        expect(types(events)).toEqual([EventType.TEXT_MESSAGE_END, EventType.RUN_FINISHED]);
        expect(events[1]).toMatchObject({
            threadId: 'thread-1',
            runId: 'run-1',
            outcome: { type: 'cancelled' },
        });
    });
});
