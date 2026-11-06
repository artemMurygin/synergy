import type { Message } from '@ag-ui/core';
import type { ChatMessage } from '../../domain/chat-message';

/** Converts the stored chat history to AG-UI messages, which the client feeds to its runtime as is. */
export const ThreadMessageMapper = {
    toAgUi(messages: readonly ChatMessage[]): Message[] {
        return messages.flatMap((message) => ThreadMessageMapper.one(message));
    },

    one(message: ChatMessage): Message[] {
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
