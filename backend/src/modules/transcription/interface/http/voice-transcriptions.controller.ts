import {
    BadRequestException,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import busboy from 'busboy';
import type { Request, Response } from 'express';
import {
    apiErrorResponse,
    apiUnauthorizedResponse,
} from '../../../../shared/http/api-error-response.decorator';
import { ClientAppGuard } from '../../../../shared/http/client-app.guard';
import { CurrentUser, type AuthenticatedUser } from '../../../auth/interface/http/decorators';
import { ownerOf } from '../../../auth/interface/http/owner-of';
import { MAX_VOICE_SIZE_BYTES } from '../../application/transcribe-voice.use-case';
import {
    TranscribeUploadedVoiceUseCase,
    type UploadedVoiceResult,
} from '../../application/transcribe-uploaded-voice.use-case';
import type { TranscriptionRejectReason } from '../../domain/transcription-result';
import { VoiceTranscriptionResponse, VoiceUploadBody } from './voice-transcriptions.responses';

const AUDIO_FIELD = 'audio';

interface VoiceUpload {
    readonly audio: Buffer;
    readonly mimeType: string;
}

function voiceError(
    status: HttpStatus,
    code: string,
    message: string,
    extra: object = {},
): HttpException {
    return new HttpException({ statusCode: status, code, message, ...extra }, status);
}

const REJECTIONS: Readonly<
    Record<TranscriptionRejectReason, { status: HttpStatus; code: string; message: string }>
> = {
    'too-long': {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'VOICE_TOO_LONG',
        message: 'The recording is longer than 3 minutes',
    },
    'too-large': {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'VOICE_TOO_LARGE',
        message: 'The recording is larger than 5 MB',
    },
    'unsupported-format': {
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        code: 'VOICE_UNSUPPORTED_FORMAT',
        message: 'The file is not a supported audio recording',
    },
    'provider-unavailable': {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'VOICE_PROVIDER_UNAVAILABLE',
        message: 'Speech recognition is unavailable, try again later',
    },
};

@ApiTags('transcriptions')
@UseGuards(ClientAppGuard)
@Controller('transcriptions')
export class VoiceTranscriptionsController {
    constructor(private readonly transcribeVoice: TranscribeUploadedVoiceUseCase) {}

    @Post('voice')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Transcribe a voice recording (multipart field "audio"); nothing is stored',
        description:
            'For the control-center and manager-helper apps. The duration is measured on the server; a recording over 3 minutes is rejected. At most VOICE_TRANSCRIPTION_MAX_PER_MINUTE requests per user per minute. The request is cancelled when the client closes the connection.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: VoiceUploadBody })
    @ApiResponse({
        status: HttpStatus.OK,
        description: '{kind:"text",text} or {kind:"no-speech"}',
        type: VoiceTranscriptionResponse,
    })
    @apiErrorResponse(
        HttpStatus.BAD_REQUEST,
        'VOICE_AUDIO_REQUIRED: no "audio" field or empty file',
    )
    @apiErrorResponse(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'VOICE_TOO_LARGE: over 5 MB (the rest of the body is not read); VOICE_TOO_LONG: over 3 minutes',
    )
    @apiErrorResponse(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'VOICE_UNSUPPORTED_FORMAT: not audio')
    @apiErrorResponse(
        HttpStatus.TOO_MANY_REQUESTS,
        'VOICE_RATE_LIMITED: the wait in seconds is in the Retry-After header',
    )
    @apiErrorResponse(
        HttpStatus.SERVICE_UNAVAILABLE,
        'VOICE_PROVIDER_UNAVAILABLE: the provider failed or timed out, or ffmpeg is missing',
    )
    @apiUnauthorizedResponse
    async transcribe(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ): Promise<VoiceTranscriptionResponse> {
        const userId = ownerOf(user);
        const cancel = new AbortController();
        const onRequestClose = (): void => {
            if (!req.complete) cancel.abort();
        };
        const onResponseClose = (): void => {
            if (!res.writableFinished) cancel.abort();
        };
        req.once('close', onRequestClose);
        res.once('close', onResponseClose);

        let upload: VoiceUpload;
        try {
            upload = await this.readUpload(req);
        } catch (error) {
            if (!req.complete) {
                // The body is not read to the end: the connection is closed after the answer.
                res.setHeader('Connection', 'close');
                res.once('finish', () => req.destroy());
            }
            throw error;
        }

        const result = await this.transcribeVoice.execute({ userId, ...upload }, cancel.signal);
        return this.answer(result, res);
    }

    private answer(result: UploadedVoiceResult, res: Response): VoiceTranscriptionResponse {
        switch (result.kind) {
            case 'text':
                return { kind: 'text', text: result.text };
            case 'no-speech':
                return { kind: 'no-speech' };
            case 'rate-limited':
                res.setHeader('Retry-After', String(result.retryAfterSec));
                throw voiceError(
                    HttpStatus.TOO_MANY_REQUESTS,
                    'VOICE_RATE_LIMITED',
                    'Too many voice requests, try again later',
                    { retryAfterSeconds: result.retryAfterSec },
                );
            case 'rejected': {
                const rejection = REJECTIONS[result.reason];
                throw voiceError(rejection.status, rejection.code, rejection.message);
            }
        }
    }

    private readUpload(req: Request): Promise<VoiceUpload> {
        return new Promise((resolve, reject) => {
            let parser: busboy.Busboy;
            try {
                parser = busboy({
                    headers: req.headers,
                    defParamCharset: 'utf8',
                    limits: { files: 1, fileSize: MAX_VOICE_SIZE_BYTES },
                });
            } catch {
                reject(new BadRequestException('Expected a multipart/form-data body'));
                return;
            }
            let found = false;
            let failed = false;
            const fail = (error: Error): void => {
                if (failed) return;
                failed = true;
                req.unpipe(parser);
                reject(error);
            };
            req.once('close', () => {
                if (!req.complete) parser.destroy();
            });
            parser.on('file', (field, stream, info) => {
                if (field !== AUDIO_FIELD || found) {
                    stream.resume();
                    return;
                }
                found = true;
                const chunks: Buffer[] = [];
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
                stream.on('limit', () => {
                    fail(
                        voiceError(
                            HttpStatus.PAYLOAD_TOO_LARGE,
                            'VOICE_TOO_LARGE',
                            'The recording is larger than 5 MB',
                        ),
                    );
                    stream.resume();
                });
                stream.on('end', () => {
                    const audio = Buffer.concat(chunks);
                    if (failed) return;
                    if (audio.byteLength === 0) {
                        fail(
                            voiceError(
                                HttpStatus.BAD_REQUEST,
                                'VOICE_AUDIO_REQUIRED',
                                'The "audio" file is empty',
                            ),
                        );
                        return;
                    }
                    resolve({ audio, mimeType: info.mimeType });
                });
            });
            parser.on('error', () => {
                fail(new BadRequestException('Malformed multipart body'));
            });
            parser.on('close', () => {
                if (!found) {
                    fail(
                        voiceError(
                            HttpStatus.BAD_REQUEST,
                            'VOICE_AUDIO_REQUIRED',
                            `Field "${AUDIO_FIELD}" is required`,
                        ),
                    );
                }
            });
            req.pipe(parser);
        });
    }
}
