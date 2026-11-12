export abstract class MeetingRecordingsPort {
    abstract findOwnedRecordingName(ownerId: string, fileId: string): Promise<string | null>;
}
