import { HttpStatus } from '@nestjs/common';
import { registerErrorStatuses } from '../../../../shared/http/error-status.registry';
import { MeetingTranscriptApplicationErrorCode } from '../application/errors';
import { MeetingTranscriptionErrorCode } from '../domain/errors';

export function registerMeetingTranscriptionErrorStatuses(): void {
    registerErrorStatuses({
        [MeetingTranscriptApplicationErrorCode.NotFound]: HttpStatus.NOT_FOUND,
        [MeetingTranscriptionErrorCode.NotRetryable]: HttpStatus.CONFLICT,
        [MeetingTranscriptionErrorCode.NotReady]: HttpStatus.CONFLICT,
        [MeetingTranscriptionErrorCode.UnknownSpeaker]: HttpStatus.UNPROCESSABLE_ENTITY,
        [MeetingTranscriptionErrorCode.InvalidSpeakerName]: HttpStatus.UNPROCESSABLE_ENTITY,
    });
}
