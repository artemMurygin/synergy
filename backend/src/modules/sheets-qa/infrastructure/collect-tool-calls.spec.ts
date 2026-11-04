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
});
