import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AttachmentTooLargeError } from '../domain/errors';
import { FileStorage, type SavedFile } from '../domain/ports/file-storage.port';

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class LocalDiskFileStorage extends FileStorage {
    constructor(private readonly baseDir: string) {
        super();
    }

    async save(stream: Readable, options: { maxBytes: number }): Promise<SavedFile> {
        const storageKey = randomUUID();
        const path = this.pathFor(storageKey);
        try {
            await mkdir(dirname(path), { recursive: true });
        } catch (error) {
            stream.destroy();
            throw error;
        }

        let sizeBytes = 0;
        const limiter = new Transform({
            transform(chunk: Buffer, _encoding, callback): void {
                sizeBytes += chunk.length;
                if (sizeBytes > options.maxBytes) {
                    callback(new AttachmentTooLargeError(options.maxBytes));
                    return;
                }
                callback(null, chunk);
            },
        });

        try {
            await pipeline(stream, limiter, createWriteStream(path, { flags: 'wx' }));
        } catch (error) {
            await rm(path, { force: true });
            throw error;
        }
        return { storageKey, sizeBytes };
    }

    async open(storageKey: string): Promise<Readable | null> {
        const path = this.pathFor(storageKey);
        const stream = createReadStream(path);
        return new Promise<Readable | null>((resolve, reject) => {
            stream.once('open', () => {
                resolve(stream);
            });
            stream.once('error', (error: NodeJS.ErrnoException) => {
                if (error.code === 'ENOENT') resolve(null);
                else reject(error);
            });
        });
    }

    async delete(storageKey: string): Promise<void> {
        await rm(this.pathFor(storageKey), { force: true });
    }

    private pathFor(storageKey: string): string {
        if (!KEY_PATTERN.test(storageKey)) throw new Error(`Invalid storage key: ${storageKey}`);
        return join(this.baseDir, storageKey.slice(0, 2), storageKey);
    }
}
