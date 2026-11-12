import type { Message } from '@ag-ui/core';
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

/** An AG-UI message of the history with its attachments and its source. */
export type HistoryMessage = Message & {
    readonly attachments: readonly HistoryAttachment[];
    readonly source: MessageSource;
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
