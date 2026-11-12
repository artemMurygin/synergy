import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
    CreateBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
    S3Client,
    S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { FileTooLargeError } from '../../domain/errors';
import { ObjectStoragePort, type PutObjectOptions } from '../../domain/ports/object-storage.port';

export interface ObjectStorageConfig {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle: boolean;
}

const PART_SIZE = 8 * 1024 * 1024;

const NOT_FOUND_ERRORS: ReadonlySet<string> = new Set(['NoSuchKey', 'NotFound', 'NoSuchBucket']);
const BUCKET_EXISTS_ERRORS: ReadonlySet<string> = new Set([
    'BucketAlreadyOwnedByYou',
    'BucketAlreadyExists',
]);

function isNotFound(error: unknown): boolean {
    return (
        error instanceof S3ServiceException &&
        (NOT_FOUND_ERRORS.has(error.name) || error.$metadata.httpStatusCode === 404)
    );
}

function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error('Object upload failed');
}

export class ObjectStorage extends ObjectStoragePort {
    private readonly client: S3Client;
    private readonly bucket: string;

    constructor(config: ObjectStorageConfig) {
        super();
        this.bucket = config.bucket;
        this.client = new S3Client({
            endpoint: config.endpoint,
            region: config.region,
            forcePathStyle: config.forcePathStyle,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }

    async ensureBucket(): Promise<void> {
        try {
            await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
            return;
        } catch (error) {
            if (!isNotFound(error)) throw error;
        }
        try {
            await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        } catch (error) {
            // Бакет мог создать параллельный экземпляр.
            if (!(error instanceof S3ServiceException && BUCKET_EXISTS_ERRORS.has(error.name))) {
                throw error;
            }
        }
    }

    async put(stream: Readable, options: PutObjectOptions): Promise<{ sizeBytes: number }> {
        let sizeBytes = 0;
        let limitError: FileTooLargeError | undefined;
        const limiter = new Transform({
            transform(chunk: Buffer, _encoding, callback): void {
                sizeBytes += chunk.length;
                if (sizeBytes > options.maxBytes) {
                    limitError = new FileTooLargeError(options.maxBytes);
                    callback(limitError);
                    return;
                }
                callback(null, chunk);
            },
        });
        const body = new PassThrough();

        const upload = new Upload({
            client: this.client,
            partSize: PART_SIZE,
            leavePartsOnError: false,
            params: {
                Bucket: this.bucket,
                Key: options.key,
                Body: body,
                ContentType: options.contentType,
            },
        });

        let failure: unknown;
        // Без `upload.abort()`: он завершает `done()` сразу, а AbortMultipartUpload уходит позже,
        // в фоне. pipeline сам разрушает body, и `done()` падает уже после отмены загрузки.
        const pumping = pipeline(stream, limiter, body).catch((error: unknown) => {
            failure ??= error;
        });

        try {
            await upload.done();
        } catch (error) {
            failure ??= error;
            // Иначе pipeline повиснет на backpressure непрочитанного body.
            body.destroy(toError(error));
        }
        await pumping;

        if (failure !== undefined || limitError !== undefined) {
            stream.destroy();
            // Объект мог успеть собраться целиком (одиночный PutObject).
            await this.delete(options.key).catch(() => undefined);
            throw limitError ?? failure;
        }
        return { sizeBytes };
    }

    async get(key: string): Promise<Readable | null> {
        try {
            const result = await this.client.send(
                new GetObjectCommand({ Bucket: this.bucket, Key: key }),
            );
            if (result.Body === undefined) return null;
            if (!(result.Body instanceof Readable)) {
                throw new TypeError('S3 returned a non-stream object body');
            }
            return result.Body;
        } catch (error) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch (error) {
            if (!isNotFound(error)) throw error;
        }
    }
}
