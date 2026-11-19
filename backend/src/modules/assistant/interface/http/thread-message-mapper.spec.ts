import { describe, expect, it } from 'vitest';
import { ChatMessage } from '../../domain/chat-message';
import { MessageAttachment } from '../../domain/message-attachment';
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
            {
                id: '7',
                role: 'user',
                content: 'Сколько стоит МВА?',
                attachments: [],
                source: 'run',
                editable: false,
            },
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
            { id: '8', role: 'assistant', content: 'Ответ', attachments: [], source: 'run' },
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
                attachments: [],
                source: 'run',
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
            {
                id: '9-tool-0-result',
                role: 'tool',
                toolCallId: '9-tool-0',
                content: '',
                attachments: [],
                source: 'run',
            },
            {
                id: '9-tool-1-result',
                role: 'tool',
                toolCallId: '9-tool-1',
                content: '',
                attachments: [],
                source: 'run',
            },
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

    it('maps the attachments in order and the system source', () => {
        const attachment = (
            fileId: string,
            position: number,
            status: 'active' | 'deleted',
        ): MessageAttachment =>
            MessageAttachment.of({
                fileId,
                position,
                name: `${fileId}.docx`,
                mediaType: 'application/pdf',
                kind: 'document',
                sizeBytes: 10,
                status,
            });
        const message = ChatMessage.system({
            id: 11,
            sessionId: 's',
            text: 'Готово',
            dedupKey: 'e',
            attachments: [attachment('b', 1, 'active'), attachment('a', 0, 'deleted')],
            createdAt,
        });
        expect(ThreadMessageMapper.toAgUi([message])).toEqual([
            {
                id: '11',
                role: 'assistant',
                content: 'Готово',
                source: 'system',
                attachments: [
                    {
                        id: 'a',
                        name: 'a.docx',
                        mediaType: 'application/pdf',
                        kind: 'document',
                        sizeBytes: 10,
                        status: 'deleted',
                    },
                    {
                        id: 'b',
                        name: 'b.docx',
                        mediaType: 'application/pdf',
                        kind: 'document',
                        sizeBytes: 10,
                        status: 'active',
                    },
                ],
            },
        ]);
    });

    it('marks a question stored with a rewind point as editable and an old one as not', () => {
        const fresh = ChatMessage.user({
            id: 1,
            sessionId: 's',
            text: 'q',
            createdAt,
            rewind: { checkpointId: 'cp-1' },
        });
        const first = ChatMessage.user({
            id: 2,
            sessionId: 's',
            text: 'q',
            createdAt,
            rewind: { checkpointId: null },
        });
        const old = ChatMessage.user({ id: 3, sessionId: 's', text: 'q', createdAt });
        expect(
            ThreadMessageMapper.toAgUi([fresh, first, old]).map(
                (m) => 'editable' in m && m.editable,
            ),
        ).toEqual([true, true, false]);
    });

    it('does not give an agent message or a tool result the editable flag', () => {
        const message = ChatMessage.agent({
            id: 8,
            sessionId: 's',
            text: 'a',
            toolCalls: [{ name: 'search', args: {}, durationMs: 400 }],
            durationMs: 5,
            createdAt,
        });
        for (const mapped of ThreadMessageMapper.toAgUi([message])) {
            expect(mapped).not.toHaveProperty('editable');
        }
    });

    it('gives each tool call its duration; calls stored before the field have none', () => {
        const message = ChatMessage.agent({
            id: 9,
            sessionId: 's',
            text: 'a',
            toolCalls: [
                { name: 'search', args: {}, durationMs: 400 },
                { name: 'read', args: {} },
            ],
            durationMs: 5,
            createdAt,
        });
        const [assistant] = ThreadMessageMapper.toAgUi([message]);
        const calls = 'toolCalls' in assistant ? (assistant.toolCalls ?? []) : [];
        expect(calls.map((call) => ('durationMs' in call ? call.durationMs : undefined))).toEqual([
            400,
            undefined,
        ]);
        expect(calls[1]).not.toHaveProperty('durationMs');
    });
});
