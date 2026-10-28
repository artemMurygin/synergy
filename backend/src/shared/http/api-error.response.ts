import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponse {
    @ApiProperty({ example: 400 })
    readonly statusCode: number;

    @ApiProperty({ example: 'Validation error' })
    readonly message: string;

    @ApiProperty({ example: 'Bad Request' })
    readonly error: string;

    @ApiProperty({ example: '2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231' })
    readonly correlationId: string;

    @ApiProperty({ example: '7b1f0f0e-3c55-4a43-9c0e-6a5d1e0d9a11' })
    readonly requestId: string;

    constructor(props: ApiErrorResponse) {
        this.statusCode = props.statusCode;
        this.message = props.message;
        this.error = props.error;
        this.correlationId = props.correlationId;
        this.requestId = props.requestId;
    }
}
