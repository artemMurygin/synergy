import type { Message } from '@ag-ui/core';
import type { ChatMessage } from '../../domain/chat-message';
import type { MessageAttachment } from '../../domain/message-attachment';
import type { MessageSource } from '../../domain/message-source';
import type { HistoryAttachment, HistoryMessage } from './thread-history.response';

function toAttachment(attachment: MessageAttachment): HistoryAttachment {
    return {
        id: attachment.fileId,
        name: attachment.name,
        mediaType: attachment.mediaType,
        kind: attachment.kind,
        sizeBytes: attachment.sizeBytes,
        status: attachment.status,
    };
}

export const ThreadMessageMapper = {
    toAgUi(messages: readonly ChatMessage[]): HistoryMessage[] {
        return messages.flatMap((message) => ThreadMessageMapper.one(message));
    },

    /** Every AG-UI message carries the attachments and the source of the stored message. */
    one(message: ChatMessage): HistoryMessage[] {
        const extras = (
            attachments: HistoryAttachment[],
        ): Pick<HistoryMessage, 'attachments' | 'source'> => ({
            attachments,
            source: message.source satisfies MessageSource,
        });
        const own = extras(message.attachments.map(toAttachment));
        return ThreadMessageMapper.agUi(message).map((agUi, index): HistoryMessage => ({
            ...agUi,
            // Only the message itself has the files; the completed tool results have none.
            ...(index === 0 ? own : extras([])),
        }));
    },

    agUi(message: ChatMessage): Message[] {
        const id = String(message.id);
        if (message.role === 'user') return [{ id, role: 'user', content: message.text }];

        const trace = message.toolCalls ?? [];
        if (trace.length === 0) return [{ id, role: 'assistant', content: message.text }];

        const calls = trace.map((call, index) => ({
            id: `${id}-tool-${String(index)}`,
            type: 'function' as const,
            function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        }));
        return [
            { id, role: 'assistant', content: message.text, toolCalls: calls },
            // Stored calls are completed; the output itself is not kept (it may hold hidden data).
            ...calls.map((call): Message => ({
                id: `${call.id}-result`,
                role: 'tool',
                toolCallId: call.id,
                content: '',
            })),
        ];
    },
};
