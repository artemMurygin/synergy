import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentTooLargeError } from '../domain/errors';
import { LocalDiskFileStorage } from './local-disk-file-storage';

async function readAll(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
}

async function listFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
}

describe('LocalDiskFileStorage', () => {
    let dir: string;
    let storage: LocalDiskFileStorage;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'tasks-storage-'));
        storage = new LocalDiskFileStorage(dir);
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('saves under a uuid key in a two-char subdirectory and returns the size', async () => {
        const result = await storage.save(
            Readable.from([Buffer.from('hello '), Buffer.from('world')]),
            {
                maxBytes: 100,
            },
        );

        expect(result.sizeBytes).toBe(11);
        expect(result.storageKey).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        const path = join(dir, result.storageKey.slice(0, 2), result.storageKey);
        expect((await stat(path)).isFile()).toBe(true);
        expect((await readFile(path)).toString()).toBe('hello world');
    });

    it('does not use any original name in the path', async () => {
        const result = await storage.save(Readable.from([Buffer.from('x')]), { maxBytes: 10 });

        expect(await listFiles(dir)).toEqual([result.storageKey]);
    });

    it('destroys the input stream when the target directory cannot be created', async () => {
        const blocker = join(dir, 'blocker');
        await writeFile(blocker, 'x');
        const broken = new LocalDiskFileStorage(join(blocker, 'nested'));
        const stream = Readable.from([Buffer.from('x')]);

        await expect(broken.save(stream, { maxBytes: 10 })).rejects.toThrow();

        expect(stream.destroyed).toBe(true);
    });

    it('removes the partial file and throws when maxBytes is exceeded', async () => {
        const stream = Readable.from([Buffer.alloc(6), Buffer.alloc(6)]);

        const error = await storage.save(stream, { maxBytes: 10 }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AttachmentTooLargeError);
        expect((error as AttachmentTooLargeError).maxBytes).toBe(10);
        expect(await listFiles(dir)).toEqual([]);
    });

    it('accepts a file of exactly maxBytes', async () => {
        const result = await storage.save(Readable.from([Buffer.alloc(10)]), { maxBytes: 10 });

        expect(result.sizeBytes).toBe(10);
    });

    it('opens a stored file as a stream', async () => {
        const { storageKey } = await storage.save(Readable.from([Buffer.from('data')]), {
            maxBytes: 10,
        });

        const stream = await storage.open(storageKey);

        if (stream === null) throw new Error('expected a stream');
        expect((await readAll(stream)).toString()).toBe('data');
    });

    it('returns null when opening a missing key', async () => {
        expect(await storage.open('11111111-1111-4111-8111-111111111111')).toBeNull();
    });

    it('deletes a file and is idempotent', async () => {
        const { storageKey } = await storage.save(Readable.from([Buffer.from('data')]), {
            maxBytes: 10,
        });

        await storage.delete(storageKey);
        await storage.delete(storageKey);

        expect(await storage.open(storageKey)).toBeNull();
    });

    it.each(['../etc/passwd', 'ab/../../x', '..', 'a/b', '', 'not-a-uuid'])(
        'rejects key %j',
        async (key) => {
            await expect(storage.open(key)).rejects.toThrow();
            await expect(storage.delete(key)).rejects.toThrow();
        },
    );
});
