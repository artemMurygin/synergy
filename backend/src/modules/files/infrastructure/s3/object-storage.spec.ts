import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
    HeadBucketCommand,
    HeadObjectCommand,
    ListMultipartUploadsCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileTooLargeError } from '../../domain/errors';
import { ObjectStorage, type ObjectStorageConfig } from './object-storage';

// Интеграционный тест против MinIO из compose. Без FILES_TEST_S3_ENDPOINT пропускается.
const endpoint = process.env.FILES_TEST_S3_ENDPOINT;

const MB = 1024 * 1024;

function configFor(bucket: string): ObjectStorageConfig {
    return {
        endpoint: endpoint ?? '',
        region: process.env.FILES_TEST_S3_REGION ?? 'us-east-1',
        accessKeyId: process.env.FILES_TEST_S3_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.FILES_TEST_S3_SECRET_KEY ?? 'minioadmin',
        bucket,
        forcePathStyle: true,
    };
}

/** Детерминированный поток заданного размера кусками по 1 МБ. */
function bytesStream(total: number): Readable {
    let sent = 0;
    return new Readable({
        read(): void {
            if (sent >= total) {
                this.push(null);
                return;
            }
            const size = Math.min(MB, total - sent);
            const chunk = Buffer.alloc(size, sent % 251);
            sent += size;
            this.push(chunk);
        },
    });
}

async function sha256Of(stream: Readable): Promise<{ hash: string; size: number }> {
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of stream) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Unexpected chunk');
        const buf = Buffer.from(chunk);
        size += buf.length;
        hash.update(buf);
    }
    return { hash: hash.digest('hex'), size };
}

function rawClient(config: ObjectStorageConfig): S3Client {
    return new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
}

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
    try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
}

describe.skipIf(endpoint === undefined)('ObjectStorage', () => {
    const bucket = `files-test-${randomUUID().slice(0, 8)}`;
    const config = configFor(bucket);
    let storage: ObjectStorage;
    let client: S3Client;

    beforeAll(async () => {
        storage = new ObjectStorage(config);
        client = rawClient(config);
        await storage.ensureBucket();
    });

    afterAll(() => {
        client.destroy();
    });

    it('ensureBucket creates the bucket and is idempotent', async () => {
        await expect(client.send(new HeadBucketCommand({ Bucket: bucket }))).resolves.toBeDefined();
        await expect(storage.ensureBucket()).resolves.toBeUndefined();
    });

    it('put streams 30 MB, returns the size, and get returns the same bytes', async () => {
        const key = randomUUID();
        const size = 30 * MB;
        const expected = await sha256Of(bytesStream(size));

        const result = await storage.put(bytesStream(size), {
            key,
            contentType: 'audio/mpeg',
            maxBytes: 40 * MB,
        });
        expect(result).toEqual({ sizeBytes: size });

        const stream = await storage.get(key);
        if (stream === null) throw new Error('object not found');
        await expect(sha256Of(stream)).resolves.toEqual(expected);
    }, 120_000);

    it('put over maxBytes throws FileTooLargeError and leaves no object', async () => {
        const key = randomUUID();
        await expect(
            storage.put(bytesStream(12 * MB), {
                key,
                contentType: 'audio/mpeg',
                maxBytes: 10 * MB,
            }),
        ).rejects.toBeInstanceOf(FileTooLargeError);
        await expect(objectExists(client, bucket, key)).resolves.toBe(false);
    }, 60_000);

    it('put over a small maxBytes (single part) throws FileTooLargeError and leaves no object', async () => {
        const key = randomUUID();
        await expect(
            storage.put(bytesStream(2 * MB), { key, contentType: 'text/plain', maxBytes: MB }),
        ).rejects.toBeInstanceOf(FileTooLargeError);
        await expect(objectExists(client, bucket, key)).resolves.toBe(false);
    });

    it('put of a source that fails midway rejects and leaves no object or multipart upload', async () => {
        const key = randomUUID();
        const failure = new Error('client aborted');
        const source = bytesStream(40 * MB);
        let sentBytes = 0;
        source.on('data', (chunk: Buffer) => {
            sentBytes += chunk.length;
            if (sentBytes >= 20 * MB) source.destroy(failure);
        });

        await expect(
            storage.put(source, { key, contentType: 'audio/mpeg', maxBytes: 100 * MB }),
        ).rejects.toBe(failure);
        await expect(objectExists(client, bucket, key)).resolves.toBe(false);
        const uploads = await client.send(
            new ListMultipartUploadsCommand({ Bucket: bucket, Prefix: key }),
        );
        expect(uploads.Uploads ?? []).toEqual([]);
    }, 60_000);

    it('get of a missing object returns null', async () => {
        await expect(storage.get(randomUUID())).resolves.toBeNull();
    });

    it('delete of a missing object does not throw', async () => {
        await expect(storage.delete(randomUUID())).resolves.toBeUndefined();
    });

    it('delete removes an existing object', async () => {
        const key = randomUUID();
        await storage.put(Readable.from([Buffer.from('hello')]), {
            key,
            contentType: 'text/plain',
            maxBytes: 100,
        });
        await storage.delete(key);
        await expect(storage.get(key)).resolves.toBeNull();
    });
});
