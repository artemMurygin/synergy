import { describe, expect, it } from 'vitest';
import { AttachmentRef } from '../../../shared/agent-capability';
import { AgentEvent } from '../domain/agent-event';
import fixture from './testing/stream-events.fixture.json';
import { mapStreamEvent, StreamEventMapper } from './map-stream-event';

const events = fixture as unknown[];
const mapAll = (): AgentEvent[] => events.flatMap((event) => mapStreamEvent(event));

describe('mapStreamEvent', () => {
    it('turns text chunks of the top-level agent into text-delta, in order', () => {
        const deltas = mapAll().filter((e) => e.type === 'text-delta');
        expect(deltas.map((e) => e.text)).toEqual([
            'Сейчас проверю. ',
            'Нашёл программу: ',
            'Дизайн, ',
            '120000 руб.',
        ]);
    });

    it('does not leak subagent text into the stream', () => {
        const text = mapAll()
            .filter((e) => e.type === 'text-delta')
            .map((e) => e.text)
            .join('');
        expect(text).not.toContain('1. **Дизайн**');
    });

    it('emits tool-call-started with callId, name and args, subagent calls included', () => {
        const started = mapAll().filter((e) => e.type === 'tool-call-started');
        expect(started).toEqual([
            AgentEvent.toolCallStarted('call_task_1', 'task', {
                description: 'Найди дизайн',
                subagent_type: 'searcher',
            }),
            AgentEvent.toolCallStarted('call_lookup_1', 'lookup', { query: 'дизайн' }),
        ]);
    });

    it('emits tool-call-finished for plain tools and for task (Command output)', () => {
        const finished = mapAll().filter((e) => e.type === 'tool-call-finished');
        expect(finished).toEqual([
            AgentEvent.toolCallFinished('call_lookup_1'),
            AgentEvent.toolCallFinished('call_task_1'),
        ]);
    });

    it('never exposes tool results as text or event payload', () => {
        const json = JSON.stringify(mapAll());
        expect(json).not.toContain('Результат поиска');
    });

    it('ignores service and malformed events', () => {
        expect(mapStreamEvent({ event: 'on_chain_start', name: 'x' })).toEqual([]);
        expect(mapStreamEvent(null)).toEqual([]);
        expect(mapStreamEvent('text')).toEqual([]);
        expect(mapStreamEvent({ event: 'on_chat_model_stream' })).toEqual([]);
    });

    it('reads text from content parts arrays', () => {
        const event = {
            event: 'on_chat_model_stream',
            metadata: { checkpoint_ns: 'model_request:1' },
            data: {
                chunk: {
                    kwargs: {
                        content: [
                            { type: 'text', text: 'а' },
                            { type: 'text', text: 'б' },
                        ],
                    },
                },
            },
        };
        expect(mapStreamEvent(event)).toEqual([AgentEvent.textDelta('аб')]);
    });
});

describe('StreamEventMapper', () => {
    it('collects the final run-finished with answer equal to joined deltas, tool calls and duration', () => {
        let now = 1000;
        const mapper = new StreamEventMapper(() => now);
        const out = events.flatMap((e) => mapper.map(e));
        now = 1250;
        const deltas = out
            .filter((e) => e.type === 'text-delta')
            .map((e) => e.text)
            .join('');
        const finished = mapper.finish();
        expect(finished).toEqual(
            AgentEvent.runFinished({
                answer: deltas,
                toolCalls: [
                    {
                        name: 'task',
                        args: { description: 'Найди дизайн', subagent_type: 'searcher' },
                        durationMs: 0, // the clock does not move while the events are mapped
                    },
                    { name: 'lookup', args: { query: 'дизайн' }, durationMs: 0 },
                ],
                durationMs: 250,
            }),
        );
        expect(finished.type === 'run-finished' && finished.answer).toBe(
            'Сейчас проверю. Нашёл программу: Дизайн, 120000 руб.',
        );
    });
});

describe('StreamEventMapper: tool call durations', () => {
    const started = (id: string, name: string): unknown => ({
        event: 'on_chat_model_end',
        data: { output: { tool_calls: [{ id, name, args: {} }] } },
    });
    const finished = (id: string): unknown => ({
        event: 'on_tool_end',
        data: { output: { tool_call_id: id } },
    });

    it('measures each call from its start to its end', () => {
        let now = 1000;
        const mapper = new StreamEventMapper(() => now);
        mapper.map(started('c1', 'search'));
        now = 1400;
        mapper.map(finished('c1'));
        mapper.map(started('c2', 'read'));
        now = 1500;
        mapper.map(finished('c2'));
        const done = mapper.finish();
        expect(done.type === 'run-finished' && done.toolCalls).toEqual([
            { name: 'search', args: {}, durationMs: 400 },
            { name: 'read', args: {}, durationMs: 100 },
        ]);
    });

    it('a call that never finished has no duration', () => {
        let now = 0;
        const mapper = new StreamEventMapper(() => now);
        mapper.map(started('c1', 'search'));
        now = 50;
        const done = mapper.finish();
        expect(done.type === 'run-finished' && done.toolCalls).toEqual([
            { name: 'search', args: {} },
        ]);
    });

    it('rounds the duration to whole milliseconds', () => {
        let now = 0;
        const mapper = new StreamEventMapper(() => now);
        mapper.map(started('c1', 'search'));
        now = 12.6;
        mapper.map(finished('c1'));
        const done = mapper.finish();
        expect(done.type === 'run-finished' && done.toolCalls[0]?.durationMs).toBe(13);
    });
});

describe('StreamEventMapper: attachments', () => {
    it('puts the files of the run into run-finished in the given order', () => {
        const mapper = new StreamEventMapper(() => 0);
        const doc = AttachmentRef.of({
            fileId: 'doc-1',
            name: 'Расшифровка.docx',
            mediaType: 'application/pdf',
            kind: 'document',
            sizeBytes: 10,
        });
        const finished = mapper.finish([doc]);
        expect(finished.type === 'run-finished' && finished.attachments).toEqual([doc]);
        expect(new StreamEventMapper(() => 0).finish()).toMatchObject({ attachments: [] });
    });
});

describe('mapStreamEvent with in-process message instances (fields without kwargs)', () => {
    it('maps text, tool call start and tool call finish', () => {
        expect(
            mapStreamEvent({ event: 'on_chat_model_stream', data: { chunk: { content: 'при' } } }),
        ).toEqual([AgentEvent.textDelta('при')]);
        expect(
            mapStreamEvent({
                event: 'on_chat_model_end',
                data: { output: { tool_calls: [{ id: 'c1', name: 'lookup', args: { q: 1 } }] } },
            }),
        ).toEqual([AgentEvent.toolCallStarted('c1', 'lookup', { q: 1 })]);
        expect(
            mapStreamEvent({ event: 'on_tool_end', data: { output: { tool_call_id: 'c1' } } }),
        ).toEqual([AgentEvent.toolCallFinished('c1')]);
        expect(
            mapStreamEvent({
                event: 'on_tool_end',
                data: { output: { update: { messages: [{ tool_call_id: 'c2' }] } } },
            }),
        ).toEqual([AgentEvent.toolCallFinished('c2')]);
    });
});
