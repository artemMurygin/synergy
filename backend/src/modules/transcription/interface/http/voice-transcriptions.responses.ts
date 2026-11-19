import { ApiProperty } from '@nestjs/swagger';

export class VoiceTranscriptionResponse {
    @ApiProperty({ enum: ['text', 'no-speech'] })
    readonly kind!: 'text' | 'no-speech';

    @ApiProperty({ required: false, example: 'Поставь Ивану задачу позвонить клиенту' })
    readonly text?: string;
}

export class VoiceUploadBody {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Recording, audio/* or video/webm, up to 5 MB and 3 minutes',
    })
    readonly audio!: unknown;
}
