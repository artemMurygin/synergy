export interface MeetingFile {
    readonly name: string;
    readonly uploadedAt: Date;
    readonly isRecording: boolean;
    readonly isStored: boolean;
}

export interface MeetingDocumentInput {
    readonly ownerId: string;
    readonly name: string;
    readonly mediaType: string;
    readonly buffer: Buffer;
}

export interface MeetingDocumentFile {
    readonly id: string;
    readonly name: string;
    readonly mediaType: string;
    readonly sizeBytes: number;
}

export abstract class MeetingFilesPort {
    abstract findFile(ownerId: string, fileId: string): Promise<MeetingFile | null>;

    abstract storeDocument(input: MeetingDocumentInput): Promise<MeetingDocumentFile>;
}
