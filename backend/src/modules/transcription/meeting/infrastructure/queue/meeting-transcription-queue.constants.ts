import { z } from 'zod';

export const MEETING_TRANSCRIPTION_QUEUE_NAME = 'meeting-transcription';

export const MEETING_TRANSCRIPTION_JOB_NAMES = {
    TRANSCRIBE: 'transcribe-meeting',
} as const;

const requestIdsSchema = z.object({ requestId: z.string(), correlationId: z.string() });

export const meetingTranscriptionJobDataSchema = z.object({
    fileId: z.string().min(1),
    requestIds: requestIdsSchema.optional(),
});

export type MeetingTranscriptionJobData = z.input<typeof meetingTranscriptionJobDataSchema>;
