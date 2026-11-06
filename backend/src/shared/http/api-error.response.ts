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

    @ApiProperty({
        required: false,
        example: 'INVALID_CREDENTIALS',
        description: 'Stable machine-readable error code',
    })
    readonly code?: string;

    @ApiProperty({
        required: false,
        type: [String],
        description: 'WEAK_PASSWORD: violated password policy rules',
    })
    readonly violations?: string[];

    @ApiProperty({
        required: false,
        example: 30,
        description: 'RATE_LIMITED: seconds until the next attempt',
    })
    readonly retryAfterSeconds?: number;

    constructor(props: ApiErrorResponse) {
        this.statusCode = props.statusCode;
        this.message = props.message;
        this.error = props.error;
        this.correlationId = props.correlationId;
        this.requestId = props.requestId;
        if (props.code !== undefined) this.code = props.code;
        if (props.violations !== undefined) this.violations = props.violations;
        if (props.retryAfterSeconds !== undefined) this.retryAfterSeconds = props.retryAfterSeconds;
    }
}
