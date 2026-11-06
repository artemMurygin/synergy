import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatSessionResponse {
    @ApiProperty({ example: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231' })
    readonly id: string;

    @ApiProperty({ example: 'Цены на МВА' })
    readonly title: string;

    @ApiProperty()
    readonly titleIsCustom: boolean;

    @ApiProperty({ example: '2026-11-06T10:00:00.000Z' })
    readonly createdAt: string;

    @ApiProperty({ example: '2026-11-06T10:05:00.000Z' })
    readonly lastActivityAt: string;

    @ApiPropertyOptional({ description: 'Present only where the run state is read' })
    readonly running?: boolean;

    constructor(props: ChatSessionResponse) {
        this.id = props.id;
        this.title = props.title;
        this.titleIsCustom = props.titleIsCustom;
        this.createdAt = props.createdAt;
        this.lastActivityAt = props.lastActivityAt;
        this.running = props.running;
    }
}
