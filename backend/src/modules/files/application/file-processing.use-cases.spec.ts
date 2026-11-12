import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileGoneError } from '../domain/errors';
import type { StoredFile } from '../domain/stored-file';
import { HoldFileUseCase } from './hold-file.use-case';
import { OpenFileForProcessingUseCase } from './open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from './release-file-hold.use-case';
import {
    FakeClock,
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
const HOUR = 60 * 60 * 1000;
const OWNER = 'owner-1';

describe('files use cases for other modules', () => {
    let clock: FakeClock;
    let files: InMemoryStoredFileRepository;
    let storage: InMemoryObjectStorage;
    let detector: FakeMediaTypeDetector;
    let transactions: InMemoryTransactionRunner;
    let upload: UploadFileUseCase;

    beforeEach(() => {
        clock = new FakeClock();
        files = new InMemoryStoredFileRepository();
        storage = new InMemoryObjectStorage();
        detector = new FakeMediaTypeDetector();
        transactions = new InMemoryTransactionRunner([files]);
        files.transactions = transactions;
        upload = new UploadFileUseCase(
            files,
            storage,
            detector,
            new FakeFilesSettings(),
            testRetentionPolicy(),
            clock,
            transactions,
            new RecordingEventPublisher(transactions),
            silentLogger(),
        );
    });

    async function seed(mime: string, content = 'hello'): Promise<StoredFile> {
        detector.mime = mime;
        const view = await upload.execute({
            ownerId: OWNER,
            fileName: mime.startsWith('audio') ? 'meeting.mp3' : 'Отчёт.pdf',
            stream: Readable.from([Buffer.from(content)]),
        });
        const file = files.byId.get(view.id);
        if (file === undefined) throw new Error('seed failed');
        files.save.mockClear();
        return file;
    }

    const seedRecording = (content?: string): Promise<StoredFile> => seed('audio/mpeg', content);
    const seedDocument = (): Promise<StoredFile> => seed('application/pdf');

    function markDeleted(file: StoredFile): void {
        file.markDeleted(clock.now(), 'owner');
    }

    describe('HoldFileUseCase', () => {
        let hold: HoldFileUseCase;
        let release: ReleaseFileHoldUseCase;

        beforeEach(() => {
            hold = new HoldFileUseCase(files, testRetentionPolicy(), clock, transactions);
            release = new ReleaseFileHoldUseCase(files, testRetentionPolicy(), clock, transactions);
        });

        it('puts a released recording on hold again for the max hold period', async () => {
            const file = await seedRecording();
            await release.execute(file.id);
            clock.current = new Date(NOW.getTime() + 2 * HOUR);

            await hold.execute(file.id);

            const saved = files.byId.get(file.id);
            expect(saved?.retention.heldUntil).toEqual(
                new Date(NOW.getTime() + 2 * HOUR + 7 * DAY),
            );
            expect(saved?.retention.expiresAt).toBeNull();
            expect(files.save).toHaveBeenCalledTimes(2);
        });

        it('throws FileGoneError for a deleted file and saves nothing', async () => {
            const file = await seedRecording();
            markDeleted(file);

            await expect(hold.execute(file.id)).rejects.toBeInstanceOf(FileGoneError);
            expect(files.save).not.toHaveBeenCalled();
        });

        it('throws FileGoneError for an unknown file', async () => {
            await expect(hold.execute('missing')).rejects.toBeInstanceOf(FileGoneError);
        });

        it('reads the file under a row lock inside a transaction', async () => {
            const file = await seedRecording();

            await hold.execute(file.id);

            expect(files.findByIdForUpdate).toHaveBeenCalledWith(file.id);
            expect(files.lockedInTransaction).toEqual([true]);
        });
    });

    describe('ReleaseFileHoldUseCase', () => {
        let release: ReleaseFileHoldUseCase;

        beforeEach(() => {
            release = new ReleaseFileHoldUseCase(files, testRetentionPolicy(), clock, transactions);
        });

        it('releases a held recording: expires one day after release', async () => {
            const file = await seedRecording();
            clock.current = new Date(NOW.getTime() + 3 * HOUR);

            await release.execute(file.id);

            const saved = files.byId.get(file.id);
            expect(saved?.retention.heldUntil).toBeNull();
            expect(saved?.retention.expiresAt).toEqual(new Date(NOW.getTime() + 3 * HOUR + DAY));
            expect(files.save).toHaveBeenCalledTimes(1);
        });

        it('is idempotent: a second release keeps the first expiry', async () => {
            const file = await seedRecording();
            await release.execute(file.id);
            const expiresAt = files.byId.get(file.id)?.retention.expiresAt;
            clock.current = new Date(NOW.getTime() + 5 * HOUR);

            await release.execute(file.id);

            expect(files.byId.get(file.id)?.retention.expiresAt).toEqual(expiresAt);
            expect(files.save).toHaveBeenCalledTimes(1);
        });

        it('does nothing for a document', async () => {
            const file = await seedDocument();
            const before = file.retention;

            await release.execute(file.id);

            expect(files.byId.get(file.id)?.retention).toEqual(before);
            expect(files.save).not.toHaveBeenCalled();
        });

        it('does nothing for a deleted file', async () => {
            const file = await seedRecording();
            markDeleted(file);

            await release.execute(file.id);

            expect(files.byId.get(file.id)?.retention.isHeld()).toBe(true);
            expect(files.save).not.toHaveBeenCalled();
        });

        it('does nothing for an unknown file', async () => {
            await expect(release.execute('missing')).resolves.toBeUndefined();
            expect(files.save).not.toHaveBeenCalled();
        });

        it('reads the file under a row lock inside a transaction', async () => {
            const file = await seedRecording();

            await release.execute(file.id);

            expect(files.findByIdForUpdate).toHaveBeenCalledWith(file.id);
            expect(files.lockedInTransaction).toEqual([true]);
        });
    });

    describe('OpenFileForProcessingUseCase', () => {
        let open: OpenFileForProcessingUseCase;
        let logger: ReturnType<typeof silentLogger>;

        beforeEach(() => {
            logger = silentLogger();
            open = new OpenFileForProcessingUseCase(files, storage, logger);
        });

        it('returns the stream and metadata without an owner check', async () => {
            const file = await seedRecording('audio-bytes');

            const result = await open.execute(file.id);

            if (result === null) throw new Error('expected an opened file');
            expect(result.contentType).toBe('audio/mpeg');
            expect(result.sizeBytes).toBe(11);
            expect((await readAll(result.stream)).toString()).toBe('audio-bytes');
        });

        it('returns null for a deleted file without touching storage', async () => {
            const file = await seedRecording();
            markDeleted(file);

            await expect(open.execute(file.id)).resolves.toBeNull();
            expect(storage.get).not.toHaveBeenCalled();
        });

        it('returns null for an unknown file', async () => {
            await expect(open.execute('missing')).resolves.toBeNull();
        });

        it('returns null when the object is missing in storage and logs an error', async () => {
            const file = await seedRecording();
            storage.objects.delete(file.storageKey);
            const error = vi.spyOn(logger, 'error');

            await expect(open.execute(file.id)).resolves.toBeNull();
            expect(error).toHaveBeenCalledWith(
                { fileId: file.id },
                'Object of an active file is missing',
            );
        });

        it('does not log an error when the file was deleted while being opened', async () => {
            const file = await seedRecording();
            storage.get.mockImplementationOnce(() => {
                file.markDeleted(clock.now(), 'owner');
                storage.objects.delete(file.storageKey);
                return Promise.resolve(null);
            });
            const error = vi.spyOn(logger, 'error');

            await expect(open.execute(file.id)).resolves.toBeNull();
            expect(error).not.toHaveBeenCalled();
        });
    });
});
