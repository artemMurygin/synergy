import type { Message } from '@ag-ui/core';
import { ApiProperty } from '@nestjs/swagger';

export class ThreadHistoryResponse {
    @ApiProperty({
        type: 'array',
        items: { type: 'object', additionalProperties: true },
        description: 'AG-UI messages of the chat',
    })
    readonly messages: Message[];

    @ApiProperty()
    readonly running: boolean;

    constructor(props: ThreadHistoryResponse) {
        this.messages = props.messages;
        this.running = props.running;
    }
}
