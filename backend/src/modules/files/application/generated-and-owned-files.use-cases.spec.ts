import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileGoneError, UnsupportedMediaTypeError } from '../domain/errors';
import { FileUploadedEvent } from '../domain/events/file-uploaded.event';
import { EmptyFileError, FileNotFoundError } from './errors';
import { FindOwnedFilesUseCase } from './find-owned-files.use-case';
import { StoreGeneratedFileUseCase } from './store-generated-file.use-case';
import {
    FakeClock,
    FakeFilesSettings,
    FakeMediaTypeDetector,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    NOW,
    RecordingEventPublisher,
    silentLogger,
    testRetentionPolicy,
} from './test-doubles';
import { UploadFileUseCase } from './upload-file.use-case';

const DAY = 24 * 60 * 60 * 1000;
const OWNER = 'owner-1';
const STRANGER = 'owner-2';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('files: generated files and owned files', () => {
    let clock: FakeClock;
    let files: InMemoryStoredFileRepository;
    let storage: InMemoryObjectStorage;
    let settings: FakeFilesSettings;
    let transactions: InMemoryTransactionRunner;
    let events: RecordingEventPublisher;
    let logger: ReturnType<typeof silentLogger>;
    let store: StoreGeneratedFileUseCase;

    beforeEach(() => {
        clock = new FakeClock();
        files = new InMemoryStoredFileRepository();
        storage = new InMemoryObjectStorage();
        settings = new FakeFilesSettings();
        transactions = new InMemoryTransactionRunner([files]);
        events = new RecordingEventPublisher(transactions);
        logger = silentLogger();
        store = new StoreGeneratedFileUseCase(
            files,
            storage,
            settings,
            testRetentionPolicy(),
            clock,
            transactions,
            events,
            logger,
        );
    });

    describe('StoreGeneratedFileUseCase', () => {
        it('stores the buffer as a document with the regular retention', async () => {
            const view = await store.execute({
                ownerId: OWNER,
                name: 'Расшифровка.docx',
                mediaType: DOCX,
                buffer: Buffer.from('docx-bytes'),
            });

            expect(view).toMatchObject({
                name: 'Расшифровка.docx',
                mediaType: DOCX,
                kind: 'document',
                sizeBytes: 10,
                status: 'active',
                awaitingProcessing: false,
                uploadedAt: NOW,
                expiresAt: new Date(NOW.getTime() + 30 * DAY),
                deletedAt: null,
            });
            const file = files.byId.get(view.id);
            expect(file?.ownerId).toBe(OWNER);
            expect(file?.storageKey).toBe(`${OWNER}/${view.id}`);
            expect(storage.objects.get(`${OWNER}/${view.id}`)).toEqual({
                content: Buffer.from('docx-bytes'),
                contentType: DOCX,
            });
            expect(storage.put).toHaveBeenCalledWith(
                expect.any(Readable),
                expect.objectContaining({ maxBytes: settings.maxDocumentBytes }),
            );
        });

        it('publishes file.uploaded inside the transaction', async () => {
            const view = await store.execute({
                ownerId: OWNER,
                name: 'a.docx',
                mediaType: DOCX,
                buffer: Buffer.from('x'),
            });

            expect(events.published).toHaveLength(1);
            const event = events.published[0];
            expect(event).toBeInstanceOf(FileUploadedEvent);
            expect(event).toMatchObject({
                fileId: view.id,
                ownerId: OWNER,
                kind: 'document',
                mediaType: DOCX,
                sizeBytes: 1,
            });
            expect(events.publishedInTransaction).toEqual([true]);
        });

        it('deletes the object when the transaction fails (compensation)', async () => {
            const failure = new Error('db down');
            files.failure = failure;

            await expect(
                store.execute({
                    ownerId: OWNER,
                    name: 'a.docx',
                    mediaType: DOCX,
                    buffer: Buffer.from('x'),
                }),
            ).rejects.toBe(failure);

            expect(storage.delete).toHaveBeenCalledTimes(1);
            expect(storage.objects.size).toBe(0);
            expect(files.byId.size).toBe(0);
        });

        it('compensates when the event cannot be published', async () => {
            events.failure = new Error('outbox down');

            await expect(
                store.execute({
                    ownerId: OWNER,
                    name: 'a.docx',
                    mediaType: DOCX,
                    buffer: Buffer.from('x'),
                }),
            ).rejects.toBe(events.failure);

            expect(storage.objects.size).toBe(0);
            expect(files.byId.size).toBe(0);
        });

        it('still reports the original error when compensation fails', async () => {
            const failure = new Error('db down');
            files.failure = failure;
            storage.delete.mockRejectedValueOnce(new Error('s3 down'));
            const error = vi.spyOn(logger, 'error');

            await expect(
                store.execute({
                    ownerId: OWNER,
                    name: 'a.docx',
                    mediaType: DOCX,
                    buffer: Buffer.from('x'),
                }),
            ).rejects.toBe(failure);

            const [savedId] = [...storage.put.mock.calls].map(([, options]) => options.key);
            expect(error).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: savedId.split('/')[1] }),
                'Orphan object left after a failed generated file store',
            );
        });

        it('rejects an empty buffer without touching the storage', async () => {
            await expect(
                store.execute({
                    ownerId: OWNER,
                    name: 'a.docx',
                    mediaType: DOCX,
                    buffer: Buffer.alloc(0),
                }),
            ).rejects.toBeInstanceOf(EmptyFileError);

            expect(storage.put).not.toHaveBeenCalled();
        });

        it('rejects a media type that is not a document', async () => {
            await expect(
                store.execute({
                    ownerId: OWNER,
                    name: 'a.mp3',
                    mediaType: 'audio/mpeg',
                    buffer: Buffer.from('x'),
                }),
            ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);

            expect(storage.put).not.toHaveBeenCalled();
        });
    });

    describe('FindOwnedFilesUseCase', () => {
        let find: FindOwnedFilesUseCase;
        let upload: UploadFileUseCase;
        let detector: FakeMediaTypeDetector;

        beforeEach(() => {
            find = new FindOwnedFilesUseCase(files);
            detector = new FakeMediaTypeDetector();
            settings.maxDocumentBytes = 1024;
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

        async function seed(ownerId: string, name: string): Promise<string> {
            const view = await upload.execute({
                ownerId,
                fileName: name,
                stream: Readable.from([Buffer.from('%PDF')]),
            });
            return view.id;
        }

        it('returns the files in the order of the input', async () => {
            const first = await seed(OWNER, 'a.pdf');
            const second = await seed(OWNER, 'b.pdf');
            const third = await seed(OWNER, 'c.pdf');

            const views = await find.execute({ ownerId: OWNER, fileIds: [third, first, second] });

            expect(views.map((view) => view.id)).toEqual([third, first, second]);
            expect(views.map((view) => view.name)).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
            expect(views.every((view) => view.status === 'active')).toBe(true);
        });

        it('returns an empty list for an empty input', async () => {
            await expect(find.execute({ ownerId: OWNER, fileIds: [] })).resolves.toEqual([]);
        });

        it('throws FileNotFoundError with the id of a foreign file', async () => {
            const mine = await seed(OWNER, 'a.pdf');
            const foreign = await seed(STRANGER, 'b.pdf');

            const error: unknown = await find
                .execute({ ownerId: OWNER, fileIds: [mine, foreign] })
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(FileNotFoundError);
            expect((error as FileNotFoundError).fileId).toBe(foreign);
        });

        it('throws FileNotFoundError with the id of a missing file', async () => {
            const mine = await seed(OWNER, 'a.pdf');
            const missing = '00000000-0000-4000-8000-000000000000';

            const error: unknown = await find
                .execute({ ownerId: OWNER, fileIds: [mine, missing] })
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(FileNotFoundError);
            expect((error as FileNotFoundError).fileId).toBe(missing);
        });

        it('throws FileGoneError with the id of a deleted file', async () => {
            const mine = await seed(OWNER, 'a.pdf');
            const deleted = await seed(OWNER, 'b.pdf');
            files.byId.get(deleted)?.markDeleted(NOW, 'owner');

            const error: unknown = await find
                .execute({ ownerId: OWNER, fileIds: [mine, deleted] })
                .catch((caught: unknown) => caught);

            expect(error).toBeInstanceOf(FileGoneError);
            expect((error as FileGoneError).fileId).toBe(deleted);
        });
    });
});
