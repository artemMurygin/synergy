import { NotFoundError } from '../../../../shared/errors';

export const MeetingTranscriptApplicationErrorCode = {
    NotFound: 'MEETING_TRANSCRIPT_NOT_FOUND',
} as const;

/** Расшифровки нет или она чужая: ответ одинаковый, чтобы не раскрывать существование. */
export class MeetingTranscriptNotFoundError extends NotFoundError {
    override readonly code: string = MeetingTranscriptApplicationErrorCode.NotFound;

    constructor(readonly fileId: string) {
        super(`Meeting transcript ${fileId} not found`);
    }
}
