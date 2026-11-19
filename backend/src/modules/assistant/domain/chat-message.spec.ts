import { describe, expect, it } from 'vitest';
import { ChatMessage, InvalidChatMessageError } from './chat-message';
import { MessageAttachment } from './message-attachment';

const createdAt = new Date('2026-01-01T10:00:00Z');

function attachment(fileId: string, position: number): MessageAttachment {
    return MessageAttachment.of({
        fileId,
        position,
        name: `${fileId}.m4a`,
        mediaType: 'audio/mp4',
        kind: 'recording',
        sizeBytes: 10,
        status: 'active',
    });
}

describe('ChatMessage', () => {
    it('a user message is a run message without attachments by default', () => {
        const message = ChatMessage.user({ id: 1, sessionId: 's', text: 'q', createdAt });
        expect(message.source).toBe('run');
        expect(message.attachments).toEqual([]);
        expect(message.dedupKey).toBeNull();
    });

    it('keeps attachments sorted by position', () => {
        const message = ChatMessage.user({
            id: 1,
            sessionId: 's',
            text: '',
            createdAt,
            attachments: [attachment('f2', 1), attachment('f1', 0)],
        });
        expect(message.attachments.map((a) => a.fileId)).toEqual(['f1', 'f2']);
    });

    it('rejects a user message without text and without attachments', () => {
        expect(() =>
            ChatMessage.restore({
                id: 1,
                sessionId: 's',
                role: 'user',
                source: 'run',
                text: '',
                toolCalls: null,
                durationMs: null,
                attachments: [],
                dedupKey: null,
                agentCheckpointId: null,
                rewindable: false,
                createdAt,
            }),
        ).toThrow(InvalidChatMessageError);
    });

    it('rejects more than 5 attachments of a user message', () => {
        expect(() =>
            ChatMessage.user({
                id: 1,
                sessionId: 's',
                text: 'q',
                createdAt,
                attachments: Array.from({ length: 6 }, (_, i) => attachment(`f${String(i)}`, i)),
            }),
        ).toThrow(InvalidChatMessageError);
    });

    it('a system message is an agent message without trace and duration, with its dedup key', () => {
        const message = ChatMessage.system({
            id: 3,
            sessionId: 's',
            text: 'Расшифровка готова',
            dedupKey: 'event-1',
            attachments: [attachment('doc', 0)],
            createdAt,
        });
        expect(message.role).toBe('agent');
        expect(message.source).toBe('system');
        expect(message.toolCalls).toBeNull();
        expect(message.durationMs).toBeNull();
        expect(message.dedupKey).toBe('event-1');
        expect(message.attachments.map((a) => a.fileId)).toEqual(['doc']);
    });

    it('rejects a system message from the user or with a trace', () => {
        const base = {
            id: 1,
            sessionId: 's',
            text: 't',
            attachments: [],
            dedupKey: 'k',
            agentCheckpointId: null,
            rewindable: false,
            createdAt,
        };
        expect(() =>
            ChatMessage.restore({
                ...base,
                role: 'user',
                source: 'system',
                toolCalls: null,
                durationMs: null,
            }),
        ).toThrow(InvalidChatMessageError);
        expect(() =>
            ChatMessage.restore({
                ...base,
                role: 'agent',
                source: 'system',
                toolCalls: [],
                durationMs: 5,
            }),
        ).toThrow(InvalidChatMessageError);
    });

    it('an agent answer keeps its attachments', () => {
        const message = ChatMessage.agent({
            id: 2,
            sessionId: 's',
            text: 'Готово',
            toolCalls: [],
            durationMs: 5,
            createdAt,
            attachments: [attachment('doc', 0)],
        });
        expect(message.source).toBe('run');
        expect(message.attachments.map((a) => a.fileId)).toEqual(['doc']);
    });
});

describe('MessageAttachment', () => {
    it('keeps the deleted status of the file', () => {
        const deleted = MessageAttachment.of({
            fileId: 'f',
            position: 0,
            name: 'a.docx',
            mediaType: 'application/pdf',
            kind: 'document',
            sizeBytes: 1,
            status: 'deleted',
        });
        expect(deleted.status).toBe('deleted');
    });

    it('rejects a negative position', () => {
        expect(() =>
            MessageAttachment.of({
                fileId: 'f',
                position: -1,
                name: 'a',
                mediaType: 'x/y',
                kind: 'document',
                sizeBytes: 1,
                status: 'active',
            }),
        ).toThrow();
    });

    it('a question created with a rewind point is rewindable and keeps the checkpoint', () => {
        const message = ChatMessage.user({
            id: 1,
            sessionId: 's',
            text: 'q',
            createdAt,
            rewind: { checkpointId: 'cp-1' },
        });
        expect(message.rewindable).toBe(true);
        expect(message.agentCheckpointId).toBe('cp-1');
    });

    it('a question without a rewind point is not rewindable', () => {
        const message = ChatMessage.user({ id: 1, sessionId: 's', text: 'q', createdAt });
        expect(message.rewindable).toBe(false);
        expect(message.agentCheckpointId).toBeNull();
    });

    it('a question of the first turn is rewindable with an empty checkpoint', () => {
        const message = ChatMessage.user({
            id: 1,
            sessionId: 's',
            text: 'q',
            createdAt,
            rewind: { checkpointId: null },
        });
        expect(message.rewindable).toBe(true);
        expect(message.agentCheckpointId).toBeNull();
    });

    it('rejects a rewindable agent message', () => {
        expect(() =>
            ChatMessage.restore({
                id: 1,
                sessionId: 's',
                role: 'agent',
                source: 'run',
                text: 'a',
                toolCalls: [],
                durationMs: 1,
                attachments: [],
                dedupKey: null,
                agentCheckpointId: null,
                rewindable: true,
                createdAt,
            }),
        ).toThrow(InvalidChatMessageError);
    });
});
