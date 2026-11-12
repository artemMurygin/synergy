import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileGoneError, FileTooLargeError, UnsupportedMediaTypeError } from '../domain/errors';
import { FileDeletedEvent } from '../domain/events/file-deleted.event';
import { FileUploadedEvent } from '../domain/events/file-uploaded.event';
import type { StoredFile } from '../domain/stored-file';
import { CreateDownloadLinkUseCase } from './create-download-link.use-case';
import { DeleteFileUseCase } from './delete-file.use-case';
import { DownloadFileContentUseCase } from './download-file-content.use-case';
import { EmptyFileError, FileNotFoundError, InvalidDownloadTokenError } from './errors';
import { GetFileUseCase } from './get-file.use-case';
import {
    FakeClock,
    FakeDownloadTokens,
    FakeFilesSettings,
    FakeMediaTypeDetector,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    NOW,
    RecordingEventPublisher,
    readAll,
    silentLogger,
    testRetentionPolicy,
} from './test-doubles';
import { UploadFileUseCase } from './upload-file.use-case';

const DAY = 24 * 60 * 60 * 1000;
const OWNER = 'owner-1';
const STRANGER = 'owner-2';

function streamOf(...chunks: string[]): Readable {
    return Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
}

describe('files use cases', () => {
    let clock: FakeClock;
    let files: InMemoryStoredFileRepository;
    let storage: InMemoryObjectStorage;
    let detector: FakeMediaTypeDetector;
    let settings: FakeFilesSettings;
    let transactions: InMemoryTransactionRunner;
    let events: RecordingEventPublisher;
    let tokens: FakeDownloadTokens;
    let logger: ReturnType<typeof silentLogger>;
    let upload: UploadFileUseCase;

    beforeEach(() => {
        clock = new FakeClock();
        files = new InMemoryStoredFileRepository();
        storage = new InMemoryObjectStorage();
        detector = new FakeMediaTypeDetector();
        settings = new FakeFilesSettings();
        transactions = new InMemoryTransactionRunner([files]);
        files.transactions = transactions;
        events = new RecordingEventPublisher(transactions);
        tokens = new FakeDownloadTokens(clock);
        logger = silentLogger();
        upload = new UploadFileUseCase(
            files,
            storage,
            detector,
            settings,
            testRetentionPolicy(),
            clock,
            transactions,
            events,
            logger,
        );
    });

    async function seed(
        ownerId = OWNER,
        content = 'hello',
        name = 'Отчёт.pdf',
    ): Promise<StoredFile> {
        detector.mime = 'application/pdf';
        const view = await upload.execute({ ownerId, fileName: name, stream: streamOf(content) });
        const file = files.byId.get(view.id);
        if (file === undefined) throw new Error('seed failed');
        return file;
    }

    describe('UploadFileUseCase', () => {
        it('stores a document with a 30-day expiry and returns its metadata', async () => {
            detector.mime = 'application/pdf';

            const view = await upload.execute({
                ownerId: OWNER,
                fileName: 'Отчёт.pdf',
                stream: streamOf('%PDF', '-1.7 body'),
            });

            expect(view).toMatchObject({
                name: 'Отчёт.pdf',
                mediaType: 'application/pdf',
                kind: 'document',
                sizeBytes: 13,
                status: 'active',
                awaitingProcessing: false,
                uploadedAt: NOW,
                expiresAt: new Date(NOW.getTime() + 30 * DAY),
                deletedAt: null,
            });
            const file = files.byId.get(view.id);
            expect(file?.ownerId).toBe(OWNER);
            expect(storage.objects.get(file?.storageKey ?? '')).toEqual({
                content: Buffer.from('%PDF-1.7 body'),
                contentType: 'application/pdf',
            });
        });

        it('passes the head of the content and the file name to the detector', async () => {
            await upload.execute({
                ownerId: OWNER,
                fileName: 'a.pdf',
                stream: streamOf('ab', 'c'),
            });

            expect(detector.detect).toHaveBeenCalledWith(Buffer.from('abc'), 'a.pdf');
        });

        it('marks a recording as awaiting processing without an expiry', async () => {
            detector.mime = 'audio/mp4';

            const view = await upload.execute({
                ownerId: OWNER,
                fileName: 'встреча.m4a',
                stream: streamOf('audio'),
            });

            expect(view).toMatchObject({
                kind: 'recording',
                awaitingProcessing: true,
                expiresAt: null,
            });
        });

        it('applies the limit of the detected kind and leaves nothing in storage (413)', async () => {
            detector.mime = 'application/pdf';
            const tooBigDocument = 'x'.repeat(settings.maxDocumentBytes + 1);

            await expect(
                upload.execute({
                    ownerId: OWNER,
                    fileName: 'a.pdf',
                    stream: streamOf(tooBigDocument),
                }),
            ).rejects.toBeInstanceOf(FileTooLargeError);
            expect(storage.put.mock.calls[0]?.[1].maxBytes).toBe(settings.maxDocumentBytes);
            expect(storage.objects.size).toBe(0);
            expect(files.byId.size).toBe(0);
            expect(events.published).toHaveLength(0);

            detector.mime = 'audio/mpeg';
            const view = await upload.execute({
                ownerId: OWNER,
                fileName: 'a.mp3',
                stream: streamOf(tooBigDocument),
            });
            expect(view.sizeBytes).toBe(settings.maxDocumentBytes + 1);
            expect(storage.put.mock.calls[1]?.[1].maxBytes).toBe(settings.maxRecordingBytes);
        });

        it('rejects an unsupported type before writing to storage (415)', async () => {
            detector.mime = null;

            await expect(
                upload.execute({ ownerId: OWNER, fileName: 'data.xlsx', stream: streamOf('MZ') }),
            ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
            expect(storage.put).not.toHaveBeenCalled();
            expect(files.byId.size).toBe(0);
        });

        it('rejects an empty stream (400)', async () => {
            await expect(
                upload.execute({ ownerId: OWNER, fileName: 'a.pdf', stream: Readable.from([]) }),
            ).rejects.toBeInstanceOf(EmptyFileError);
            expect(detector.detect).not.toHaveBeenCalled();
            expect(storage.put).not.toHaveBeenCalled();
        });

        it('rejects an invalid file name before reading the content', async () => {
            await expect(
                upload.execute({ ownerId: OWNER, fileName: '../a.pdf', stream: streamOf('x') }),
            ).rejects.toThrow();
            expect(storage.put).not.toHaveBeenCalled();
        });

        it('deletes the object when the transaction fails (compensation)', async () => {
            const failure = new Error('db down');
            files.failure = failure;

            await expect(
                upload.execute({ ownerId: OWNER, fileName: 'a.pdf', stream: streamOf('x') }),
            ).rejects.toBe(failure);
            expect(storage.put).toHaveBeenCalledTimes(1);
            expect(storage.delete).toHaveBeenCalledTimes(1);
            expect(storage.objects.size).toBe(0);
            expect(transactions.rollbacks).toBe(1);
        });

        it('rolls back the row and deletes the object when publishing the event fails', async () => {
            events.failure = new Error('outbox down');

            await expect(
                upload.execute({ ownerId: OWNER, fileName: 'a.pdf', stream: streamOf('x') }),
            ).rejects.toThrow('outbox down');
            expect(files.byId.size).toBe(0);
            expect(storage.objects.size).toBe(0);
        });

        it('still reports the original error when compensation fails', async () => {
            const failure = new Error('db down');
            files.failure = failure;
            const s3Failure = new Error('s3 down');
            storage.delete.mockRejectedValueOnce(s3Failure);
            const error = vi.spyOn(logger, 'error');

            await expect(
                upload.execute({ ownerId: OWNER, fileName: 'a.pdf', stream: streamOf('x') }),
            ).rejects.toBe(failure);
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({ err: s3Failure }),
                'Orphan object left after a failed upload',
            );
            expect(JSON.stringify(error.mock.calls)).not.toContain('a.pdf');
        });

        it('publishes FileUploaded in the same transaction as the row', async () => {
            detector.mime = 'audio/ogg';

            const view = await upload.execute({
                ownerId: OWNER,
                fileName: 'voice.ogg',
                stream: streamOf('audio'),
            });

            expect(events.publishedInTransaction).toEqual([true]);
            expect(transactions.commits).toBe(1);
            const [event] = events.published;
            expect(event).toBeInstanceOf(FileUploadedEvent);
            expect(event).toMatchObject({
                aggregateId: view.id,
                ownerId: OWNER,
                kind: 'recording',
                mediaType: 'audio/ogg',
                sizeBytes: 5,
            });
        });
    });

    describe('GetFileUseCase', () => {
        let getFile: GetFileUseCase;

        beforeEach(() => {
            getFile = new GetFileUseCase(files);
        });

        it('returns the metadata to the owner', async () => {
            const file = await seed();

            await expect(
                getFile.execute({ ownerId: OWNER, fileId: file.id }),
            ).resolves.toMatchObject({ id: file.id, name: 'Отчёт.pdf', status: 'active' });
        });

        it('gives the same 404 for a foreign and a missing file', async () => {
            const file = await seed();

            const foreign = getFile.execute({ ownerId: STRANGER, fileId: file.id });
            const missing = getFile.execute({ ownerId: OWNER, fileId: 'missing' });

            const errors = await Promise.all([
                foreign.catch((error: unknown) => error),
                missing.catch((error: unknown) => error),
            ]);
            for (const error of errors) {
                expect(error).toBeInstanceOf(FileNotFoundError);
                expect(error).toMatchObject({ code: 'FILE_NOT_FOUND' });
            }
        });

        it('returns a deleted file with its deletion time', async () => {
            const file = await seed();
            const deletedAt = new Date(NOW.getTime() + DAY);
            file.markDeleted(deletedAt, 'owner');

            await expect(
                getFile.execute({ ownerId: OWNER, fileId: file.id }),
            ).resolves.toMatchObject({
                status: 'deleted',
                deletedAt,
                expiresAt: null,
                awaitingProcessing: false,
            });
        });
    });

    describe('DeleteFileUseCase', () => {
        let deleteFile: DeleteFileUseCase;

        beforeEach(() => {
            deleteFile = new DeleteFileUseCase(files, storage, clock, transactions, events);
        });

        it('deletes the object and marks the row deleted', async () => {
            const file = await seed();
            clock.current = new Date(NOW.getTime() + 1000);

            await deleteFile.execute({ ownerId: OWNER, fileId: file.id });

            expect(storage.objects.has(file.storageKey)).toBe(false);
            const saved = files.byId.get(file.id);
            expect(saved?.status).toBe('deleted');
            expect(saved?.deletedAt).toEqual(clock.current);
        });

        it('succeeds again on a repeated delete without touching storage', async () => {
            const file = await seed();
            await deleteFile.execute({ ownerId: OWNER, fileId: file.id });
            storage.delete.mockClear();

            await expect(
                deleteFile.execute({ ownerId: OWNER, fileId: file.id }),
            ).resolves.toBeUndefined();
            expect(storage.delete).not.toHaveBeenCalled();
            expect(files.byId.get(file.id)?.status).toBe('deleted');
        });

        it('gives 404 for a foreign or missing file and keeps the object', async () => {
            const file = await seed();

            await expect(
                deleteFile.execute({ ownerId: STRANGER, fileId: file.id }),
            ).rejects.toBeInstanceOf(FileNotFoundError);
            await expect(
                deleteFile.execute({ ownerId: OWNER, fileId: 'missing' }),
            ).rejects.toBeInstanceOf(FileNotFoundError);
            expect(storage.objects.has(file.storageKey)).toBe(true);
        });

        it('locks the row in a transaction and publishes file.deleted by the owner', async () => {
            const file = await seed();
            events.published.length = 0;
            events.publishedInTransaction.length = 0;

            await deleteFile.execute({ ownerId: OWNER, fileId: file.id });

            expect(files.findByIdForUpdate).toHaveBeenCalledWith(file.id);
            expect(files.lockedInTransaction).toEqual([true]);
            expect(events.published).toHaveLength(1);
            const [event] = events.published;
            expect(event).toBeInstanceOf(FileDeletedEvent);
            if (!(event instanceof FileDeletedEvent)) return;
            expect(event.cause).toBe('owner');
            expect(events.publishedInTransaction).toEqual([true]);
        });

        it('keeps the file active when deleting the object fails', async () => {
            const file = await seed();
            storage.delete.mockRejectedValueOnce(new Error('s3 down'));

            await expect(deleteFile.execute({ ownerId: OWNER, fileId: file.id })).rejects.toThrow(
                's3 down',
            );
            expect(files.byId.get(file.id)?.status).toBe('active');
        });
    });

    describe('CreateDownloadLinkUseCase', () => {
        let createLink: CreateDownloadLinkUseCase;

        beforeEach(() => {
            createLink = new CreateDownloadLinkUseCase(files, tokens, settings);
        });

        it('returns a url with a token and its expiry', async () => {
            const file = await seed();

            const link = await createLink.execute({ ownerId: OWNER, fileId: file.id });

            expect(tokens.sign).toHaveBeenCalledWith(file.id, settings.downloadLinkTtlSec);
            const signed = tokens.sign.mock.results[0];
            if (signed.type !== 'return') throw new Error('expected a signed token');
            const token = signed.value.token;
            expect(link.url).toBe(`/files/${file.id}/content?token=${encodeURIComponent(token)}`);
            expect(link.expiresAt).toEqual(
                new Date(NOW.getTime() + settings.downloadLinkTtlSec * 1000),
            );
        });

        it('gives 404 for a foreign file', async () => {
            const file = await seed();

            await expect(
                createLink.execute({ ownerId: STRANGER, fileId: file.id }),
            ).rejects.toBeInstanceOf(FileNotFoundError);
            expect(tokens.sign).not.toHaveBeenCalled();
        });

        it('gives 410 for a deleted file', async () => {
            const file = await seed();
            file.markDeleted(NOW, 'owner');

            await expect(
                createLink.execute({ ownerId: OWNER, fileId: file.id }),
            ).rejects.toBeInstanceOf(FileGoneError);
            expect(tokens.sign).not.toHaveBeenCalled();
        });
    });

    describe('DownloadFileContentUseCase', () => {
        let download: DownloadFileContentUseCase;

        beforeEach(() => {
            download = new DownloadFileContentUseCase(files, storage, tokens, silentLogger());
        });

        it('returns the stream, name, type and size for a valid token', async () => {
            const file = await seed(OWNER, 'content', 'Отчёт.pdf');
            const { token } = tokens.sign(file.id, 300);

            const result = await download.execute({ fileId: file.id, token });

            expect(result).toMatchObject({
                name: 'Отчёт.pdf',
                contentType: 'application/pdf',
                sizeBytes: 7,
            });
            expect((await readAll(result.stream)).toString()).toBe('content');
        });

        it('gives 403 for a token of another file, an expired or a forged token', async () => {
            const a = await seed();
            const b = await seed();
            const tokenOfA = tokens.sign(a.id, 300).token;

            await expect(
                download.execute({ fileId: b.id, token: tokenOfA }),
            ).rejects.toBeInstanceOf(InvalidDownloadTokenError);
            await expect(
                download.execute({ fileId: a.id, token: 'forged' }),
            ).rejects.toBeInstanceOf(InvalidDownloadTokenError);
            clock.current = new Date(NOW.getTime() + 6 * 60 * 1000);
            await expect(
                download.execute({ fileId: a.id, token: tokenOfA }),
            ).rejects.toBeInstanceOf(InvalidDownloadTokenError);
            expect(storage.get).not.toHaveBeenCalled();
        });

        it('gives 403 for a bad token even if the file does not exist', async () => {
            await expect(
                download.execute({ fileId: 'missing', token: 'forged' }),
            ).rejects.toBeInstanceOf(InvalidDownloadTokenError);
        });

        it('gives 410 for a file deleted after the link was issued', async () => {
            const file = await seed();
            const { token } = tokens.sign(file.id, 300);
            await new DeleteFileUseCase(files, storage, clock, transactions, events).execute({
                ownerId: OWNER,
                fileId: file.id,
            });

            await expect(download.execute({ fileId: file.id, token })).rejects.toBeInstanceOf(
                FileGoneError,
            );
        });

        it('gives 410 when the object is missing from storage', async () => {
            const file = await seed();
            const { token } = tokens.sign(file.id, 300);
            storage.objects.delete(file.storageKey);

            await expect(download.execute({ fileId: file.id, token })).rejects.toBeInstanceOf(
                FileGoneError,
            );
        });

        it('gives 404 for a valid token of a file without a row', async () => {
            const { token } = tokens.sign('ghost', 300);

            await expect(download.execute({ fileId: 'ghost', token })).rejects.toBeInstanceOf(
                FileNotFoundError,
            );
        });
    });
});
