import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../../domain/chat-message';
import { ThreadMessageMapper } from './thread-message-mapper';

const createdAt = new Date('2026-01-01T10:00:00Z');

describe('ThreadMessageMapper', () => {
    it('maps a user message to an AG-UI user message', () => {
        const message = ChatMessage.user({
            id: 7,
            sessionId: 's',
            text: 'Сколько стоит МВА?',
            createdAt,
        });
        expect(ThreadMessageMapper.toAgUi([message])).toEqual([
            { id: '7', role: 'user', content: 'Сколько стоит МВА?' },
        ]);
    });

    it('maps an agent message without tools to an assistant message', () => {
        const message = ChatMessage.agent({
            id: 8,
            sessionId: 's',
            text: 'Ответ',
            toolCalls: [],
            durationMs: 5,
            createdAt,
        });
        expect(ThreadMessageMapper.toAgUi([message])).toEqual([
            { id: '8', role: 'assistant', content: 'Ответ' },
        ]);
    });

    it('maps the tool trace to assistant toolCalls with JSON arguments and completed tool results', () => {
        const message = ChatMessage.agent({
            id: 9,
            sessionId: 's',
            text: 'Ответ',
            toolCalls: [
                { name: 'search_rows', args: { query: 'МВА' } },
                { name: 'read_range', args: { range: 'A1:B2' } },
            ],
            durationMs: 5,
            createdAt,
        });
        expect(ThreadMessageMapper.toAgUi([message])).toEqual([
            {
                id: '9',
                role: 'assistant',
                content: 'Ответ',
                toolCalls: [
                    {
                        id: '9-tool-0',
                        type: 'function',
                        function: { name: 'search_rows', arguments: '{"query":"МВА"}' },
                    },
                    {
                        id: '9-tool-1',
                        type: 'function',
                        function: { name: 'read_range', arguments: '{"range":"A1:B2"}' },
                    },
                ],
            },
            { id: '9-tool-0-result', role: 'tool', toolCallId: '9-tool-0', content: '' },
            { id: '9-tool-1-result', role: 'tool', toolCallId: '9-tool-1', content: '' },
        ]);
    });

    it('keeps the order of the history', () => {
        const messages = [
            ChatMessage.user({ id: 1, sessionId: 's', text: 'q', createdAt }),
            ChatMessage.agent({
                id: 2,
                sessionId: 's',
                text: 'a',
                toolCalls: [],
                durationMs: 1,
                createdAt,
            }),
        ];
        expect(ThreadMessageMapper.toAgUi(messages).map((m) => m.role)).toEqual([
            'user',
            'assistant',
        ]);
    });
});
