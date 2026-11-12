import type { MeetingTranscript } from '../domain/meeting-transcript';
import type { MeetingFilesPort } from '../domain/ports/meeting-files.port';

export interface RecordingInfo {
    readonly name: string;
    readonly uploadedAt: Date;
}

const FALLBACK_RECORDING_NAME = 'Запись встречи';

// The file metadata outlives the recording itself; the transcript is created on upload.
export async function describeRecording(
    files: MeetingFilesPort,
    transcript: MeetingTranscript,
): Promise<RecordingInfo> {
    const file = await files.findFile(transcript.ownerId, transcript.fileId);
    return file === null
        ? { name: FALLBACK_RECORDING_NAME, uploadedAt: transcript.createdAt }
        : { name: file.name, uploadedAt: file.uploadedAt };
}
