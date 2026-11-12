import { vi } from 'vitest';
import { GetFileUseCase } from '../../../files/application/get-file.use-case';
import type { StoredFileView } from '../../../files/application/stored-file-view';
import {
    FakeClock,
    FakeFilesSettings,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    RecordingEventPublisher,
    silentLogger,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import {
    StoreGeneratedFileUseCase,
    type StoreGeneratedFileInput,
} from '../../../files/application/store-generated-file.use-case';
import { FileName } from '../../../files/domain/file-name';
import { MediaType } from '../../../files/domain/media-type';
import { StoredFile } from '../../../files/domain/stored-file';
import {
    DOCX_MEDIA_TYPE,
    DocumentRendererPort,
    type DocumentBlock,
    type DocumentModel,
} from '../../../../shared/documents';

/** Генератор-двойник: запоминает модели и отдаёт буфер фиксированного размера. */
export class FakeDocumentRenderer extends DocumentRendererPort {
    readonly mediaType = DOCX_MEDIA_TYPE;
    readonly extension = '.docx';
    readonly rendered: DocumentModel[] = [];

    constructor(private readonly size = 2048) {
        super();
    }

    render(doc: DocumentModel): Promise<Buffer> {
        this.rendered.push(doc);
        return Promise.resolve(Buffer.alloc(this.size, 1));
    }

    last(): DocumentModel {
        const doc = this.rendered.at(-1);
        if (doc === undefined) throw new Error('nothing was rendered');
        return doc;
    }
}

/** Текст блока одной строкой (фрагменты абзаца склеиваются). */
export function blockText(block: DocumentBlock): string {
    if (block.kind === 'heading') return block.text;
    if (block.kind === 'table') return block.header.join(' | ');
    return 'runs' in block ? block.runs.map((r) => r.text).join('') : block.text;
}

export interface StoreGeneratedFileDouble {
    readonly store: StoreGeneratedFileUseCase;
    readonly calls: StoreGeneratedFileInput[];
}

/** `StoreGeneratedFile`, который ничего не пишет: каждый вызов отдаёт новый файл. */
export function storeGeneratedFileDouble(): StoreGeneratedFileDouble {
    const transactions = new InMemoryTransactionRunner();
    const store = new StoreGeneratedFileUseCase(
        new InMemoryStoredFileRepository(),
        new InMemoryObjectStorage(),
        new FakeFilesSettings(),
        testRetentionPolicy(),
        new FakeClock(),
        transactions,
        new RecordingEventPublisher(transactions),
        silentLogger(),
    );
    const calls: StoreGeneratedFileInput[] = [];
    vi.spyOn(store, 'execute').mockImplementation((input) => {
        calls.push(input);
        const view: StoredFileView = {
            id: `generated-${String(calls.length)}`,
            name: input.name,
            mediaType: input.mediaType,
            kind: 'document',
            sizeBytes: input.buffer.length,
            status: 'active',
            awaitingProcessing: false,
            uploadedAt: new Date('2026-11-12T10:00:00Z'),
            expiresAt: new Date('2026-12-12T10:00:00Z'),
            deletedAt: null,
        };
        return Promise.resolve(view);
    });
    return { store, calls };
}

export interface RecordingFilesFixture {
    readonly files: InMemoryStoredFileRepository;
    readonly getFile: GetFileUseCase;
    /** Кладёт запись владельца в хранилище метаданных. */
    addRecording(input: {
        id: string;
        ownerId: string;
        name: string;
        uploadedAt: Date;
    }): StoredFile;
}

/** Метаданные записей встреч через настоящий `GetFileUseCase`. */
export function recordingFiles(): RecordingFilesFixture {
    const files = new InMemoryStoredFileRepository();
    return {
        files,
        getFile: new GetFileUseCase(files),
        addRecording({ id, ownerId, name, uploadedAt }) {
            const file = StoredFile.upload(
                {
                    id,
                    ownerId,
                    name: FileName.of(name),
                    mediaType: MediaType.of('audio/mp4'),
                    sizeBytes: 1024,
                    storageKey: `${ownerId}/${id}`,
                    now: uploadedAt,
                },
                testRetentionPolicy(),
            );
            file.pullDomainEvents();
            files.byId.set(id, file);
            return file;
        },
    };
}
