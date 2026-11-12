import type { AttachmentRef } from './attachment-ref';

export type RunAttachmentListener = (file: AttachmentRef) => void;

/**
 * Collector of the files the agent attaches to its answer during one run. A tool that issued a
 * document adds it here; the runner streams every new file and stores the list with the answer.
 */
export class RunAttachments {
    private readonly files: AttachmentRef[] = [];
    private readonly listeners = new Set<RunAttachmentListener>();

    /** A new empty collector; one per run. */
    static create(): RunAttachments {
        return new RunAttachments();
    }

    /** A file already in the list is ignored; a new one is announced to the subscribers. */
    add(file: AttachmentRef): void {
        if (this.files.some((known) => known.fileId === file.fileId)) return;
        this.files.push(file);
        for (const listener of this.listeners) listener(file);
    }

    /** In the order of adding. */
    list(): readonly AttachmentRef[] {
        return [...this.files];
    }

    /** Returns the function that removes the subscription. */
    subscribe(listener: RunAttachmentListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
}
