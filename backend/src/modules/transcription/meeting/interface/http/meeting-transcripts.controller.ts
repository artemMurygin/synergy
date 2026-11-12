import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
    apiErrorResponse,
    apiUnauthorizedResponse,
} from '../../../../../shared/http/api-error-response.decorator';
import { CurrentUser, type AuthenticatedUser } from '../../../../auth/interface/http/decorators';
import { ownerOf } from '../../../../auth/interface/http/owner-of';
import { GetMeetingTranscriptUseCase } from '../../application/get-meeting-transcript.use-case';
import { RetryMeetingTranscriptionUseCase } from '../../application/retry-meeting-transcription.use-case';
import { MeetingTranscriptResponse } from './meeting-transcripts.responses';

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
