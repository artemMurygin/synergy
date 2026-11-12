import type { MeetingTranscript } from '../domain/meeting-transcript';
import type { MeetingTranscriptRepositoryPort } from '../domain/ports/meeting-transcript-repository.port';
import { MeetingTranscriptNotFoundError } from './errors';

/** Чужая и несуществующая расшифровка неразличимы. */
export async function findOwnedTranscript(
    transcripts: MeetingTranscriptRepositoryPort,
    ownerId: string,
    fileId: string,
): Promise<MeetingTranscript> {
    const transcript = await transcripts.findByFileId(fileId);
    if (transcript?.ownerId !== ownerId) throw new MeetingTranscriptNotFoundError(fileId);
    return transcript;
}
