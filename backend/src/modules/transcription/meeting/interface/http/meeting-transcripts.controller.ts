import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
    apiErrorResponse,
    apiUnauthorizedResponse,
} from '../../../../../shared/http/api-error-response.decorator';
import { zodToOpenApi } from '../../../../../shared/http/zod-openapi';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { CurrentUser, type AuthenticatedUser } from '../../../../auth/interface/http/decorators';
import { ownerOf } from '../../../../auth/interface/http/owner-of';
import { GetMeetingTranscriptUseCase } from '../../application/get-meeting-transcript.use-case';
import { RenameSpeakersUseCase } from '../../application/rename-speakers.use-case';
import { RetryMeetingTranscriptionUseCase } from '../../application/retry-meeting-transcription.use-case';
import { MeetingTranscriptResponse, SpeakersResponse } from './meeting-transcripts.responses';
import {
    renameSpeakersRequestSchema,
    type RenameSpeakersRequest,
} from './meeting-transcripts.schemas';

const notFound = apiErrorResponse(
    HttpStatus.NOT_FOUND,
    'MEETING_TRANSCRIPT_NOT_FOUND: no transcript or it belongs to another user',
);

@ApiTags('transcripts')
@ApiBearerAuth()
@Controller('transcripts')
export class MeetingTranscriptsController {
    constructor(
        private readonly getTranscript: GetMeetingTranscriptUseCase,
        private readonly retryTranscription: RetryMeetingTranscriptionUseCase,
        private readonly renameSpeakers: RenameSpeakersUseCase,
    ) {}

    @Get(':fileId')
    @ApiOperation({ summary: 'Status and segments of a meeting recording transcript' })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'Transcript; segments only when finished',
        type: MeetingTranscriptResponse,
    })
    @notFound
    @apiUnauthorizedResponse
    async get(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('fileId', ParseUUIDPipe) fileId: string,
    ): Promise<MeetingTranscriptResponse> {
        return new MeetingTranscriptResponse(
            await this.getTranscript.execute({ ownerId: ownerOf(user), fileId }),
        );
    }

    @Put(':fileId/speakers')
    @ApiOperation({
        summary: 'Assign names to speakers of a completed transcript, all or nothing',
        description: 'An empty or null name resets the speaker to the label «Спикер N».',
    })
    @ApiBody({ schema: zodToOpenApi(renameSpeakersRequestSchema) })
    @ApiResponse({
        status: HttpStatus.OK,
        description: 'All speakers with names and talk time',
        type: SpeakersResponse,
    })
    @apiErrorResponse(HttpStatus.BAD_REQUEST, 'Malformed body or id')
    @apiErrorResponse(
        HttpStatus.CONFLICT,
        'MEETING_TRANSCRIPT_NOT_READY: the transcript is not completed',
    )
    @apiErrorResponse(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'MEETING_TRANSCRIPT_UNKNOWN_SPEAKER or MEETING_TRANSCRIPT_INVALID_SPEAKER_NAME; no name changed',
    )
    @notFound
    @apiUnauthorizedResponse
    async putSpeakers(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('fileId', ParseUUIDPipe) fileId: string,
        @Body(new ZodValidationPipe(renameSpeakersRequestSchema)) body: RenameSpeakersRequest,
    ): Promise<SpeakersResponse> {
        return new SpeakersResponse(
            await this.renameSpeakers.execute({
                ownerId: ownerOf(user),
                fileId,
                assignments: body.speakers,
            }),
        );
    }

    @Post(':fileId/retry')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Retry a failed transcript while the recording is stored' })
    @ApiResponse({ status: HttpStatus.ACCEPTED, description: 'Queued again, status "pending"' })
    @apiErrorResponse(
        HttpStatus.CONFLICT,
        'MEETING_TRANSCRIPTION_NOT_RETRYABLE: the transcript is not failed',
    )
    @apiErrorResponse(HttpStatus.GONE, 'FILE_GONE: the recording is deleted')
    @notFound
    @apiUnauthorizedResponse
    async retry(
        @CurrentUser() user: AuthenticatedUser | undefined,
        @Param('fileId', ParseUUIDPipe) fileId: string,
    ): Promise<void> {
        await this.retryTranscription.execute({ ownerId: ownerOf(user), fileId });
    }
}
