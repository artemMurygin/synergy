import type { Message, ToolCall } from '@ag-ui/core';
import { ApiProperty } from '@nestjs/swagger';
import type { AttachmentKind } from '../../../../shared/agent-capability';
import type { AttachmentFileStatus } from '../../domain/message-attachment';
import type { MessageSource } from '../../domain/message-source';

/** A file of a history message; `status` is the current state of the stored file. */
export interface HistoryAttachment {
    readonly id: string;
    readonly name: string;
    readonly mediaType: string;
    readonly kind: AttachmentKind;
    readonly sizeBytes: number;
    readonly status: AttachmentFileStatus;
}

/** A tool call of an assistant message of the history: AG-UI call plus its measured duration. */
export type HistoryToolCall = ToolCall & { readonly durationMs?: number };

/**
 * An AG-UI message of the history with its attachments and its source. A question also has
 * `editable` (the answer can be restarted from it); an assistant message has timed tool calls.
 */
export type HistoryAgUiMessage =
    | Exclude<Message, { role: 'assistant' }>
    | (Omit<Extract<Message, { role: 'assistant' }>, 'toolCalls'> & {
          readonly toolCalls?: readonly HistoryToolCall[];
      });

export type HistoryMessage = HistoryAgUiMessage & {
    readonly attachments: readonly HistoryAttachment[];
    readonly source: MessageSource;
    readonly editable?: boolean;
};

export class ThreadHistoryResponse {
    @ApiProperty({
        type: 'array',
        items: {
            type: 'object',
            additionalProperties: true,
            properties: {
                attachments: {
                    type: 'array',
                    description: 'Files of the message in the order of sending',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            mediaType: { type: 'string' },
                            kind: { type: 'string', enum: ['recording', 'document'] },
                            sizeBytes: { type: 'number' },
                            status: {
                                type: 'string',
                                enum: ['active', 'deleted'],
                                description: 'deleted: the retention period of the file is over',
                            },
                        },
                        required: ['id', 'name', 'mediaType', 'kind', 'sizeBytes', 'status'],
                    },
                },
                editable: {
                    type: 'boolean',
                    description:
                        'Only on a question: the answer can be restarted from it (false for questions stored before the feature)',
                },
                source: {
                    type: 'string',
                    enum: ['run', 'system'],
                    description: 'run: a question or its answer; system: posted on a domain event',
                },
            },
            required: ['attachments', 'source'],
        },
        description: 'AG-UI messages of the chat with attachments and source',
    })
    readonly messages: HistoryMessage[];

    @ApiProperty()
    readonly running: boolean;

    constructor(props: ThreadHistoryResponse) {
        this.messages = props.messages;
        this.running = props.running;
    }
}
