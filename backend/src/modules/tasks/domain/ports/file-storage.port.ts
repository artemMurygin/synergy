import type { Readable } from 'node:stream';

export interface SavedFile {
    storageKey: string;
    sizeBytes: number;
}

export abstract class FileStorage {
    /**
     * Streams the content to storage under a generated key.
     * Throws AttachmentTooLargeError and leaves no partial file when the stream exceeds `maxBytes`.
     */
    abstract save(stream: Readable, options: { maxBytes: number }): Promise<SavedFile>;
    /** Opens the stored content, or returns null when the file is missing. */
    abstract open(storageKey: string): Promise<Readable | null>;
    /** Removes the file; removing a missing file is not an error. */
    abstract delete(storageKey: string): Promise<void>;
}
