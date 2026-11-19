import { describe, expect, it } from 'vitest';
import { collectToolCalls } from './collect-tool-calls';

describe('collectToolCalls', () => {
    it('lists tool calls of model messages in order and ignores other messages', () => {
        const messages = [
            { type: 'human', content: 'вопрос' },
            { type: 'ai', tool_calls: [{ name: 'search_cells', args: { query: 'x' } }] },
            { type: 'tool', content: '{}' },
            {
                type: 'ai',
                tool_calls: [
                    { name: 'read_rows', args: { sheet: 'СПО' } },
                    { name: 'find_related', args: {} },
                ],
            },
            { type: 'ai', tool_calls: [], content: 'ответ' },
        ];
        expect(collectToolCalls(messages).map((c) => c.name)).toEqual([
            'search_cells',
            'read_rows',
            'find_related',
        ]);
        expect(collectToolCalls(messages)[1]?.args).toEqual({ sheet: 'СПО' });
    });

    it('returns an empty list when nothing was called', () => {
        expect(collectToolCalls([{ type: 'ai', content: 'привет' }, null, 'text'])).toEqual([]);
    });

    it('writes durationMs of the calls that have a measured duration, matched by call id', () => {
        const messages = [
            {
                type: 'ai',
                tool_calls: [
                    { id: 'c1', name: 'search_cells', args: {} },
                    { id: 'c2', name: 'read_rows', args: {} },
                    { id: 'c3', name: 'find_related', args: {} },
                ],
            },
        ];
        const durations = new Map([
            ['c1', 400],
            ['c2', 0],
        ]);
        const calls = collectToolCalls(messages, durations);
        expect(calls.map((call) => call.durationMs)).toEqual([400, 0, undefined]);
        expect(calls[2]).not.toHaveProperty('durationMs');
    });

    it('leaves calls without durations as before', () => {
        const calls = collectToolCalls([
            { type: 'ai', tool_calls: [{ id: 'c1', name: 'x', args: {} }] },
        ]);
        expect(calls).toEqual([{ name: 'x', args: {} }]);
    });
});
