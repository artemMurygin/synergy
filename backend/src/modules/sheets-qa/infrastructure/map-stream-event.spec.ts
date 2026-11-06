import { describe, expect, it } from 'vitest';
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
                    },
                    { name: 'lookup', args: { query: 'дизайн' } },
                ],
                durationMs: 250,
            }),
        );
        expect(finished.type === 'run-finished' && finished.answer).toBe(
            'Сейчас проверю. Нашёл программу: Дизайн, 120000 руб.',
        );
    });
});
