import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DOCX_MEDIA_TYPE,
    DocumentRendererPort,
    type DocumentModel,
    type TableBlock,
} from '../../../shared/documents';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { silentLogger } from '../../files/application/test-doubles';
import { DraftOrigin } from '../domain/draft-origin';
import { DraftTaskItem } from '../domain/draft-task-item';
import {
    GeneratedDocumentStore,
    type GeneratedDocumentInput,
} from '../domain/ports/generated-document-store.port';
import { TaskBatchResult } from '../domain/task-batch-result';
import { TasksReportDocument } from './tasks-report-document';
import { FakeUserDirectory } from './test-doubles';

const POSTED_AT = new Date('2026-03-01T22:30:00Z'); // 02.03.2026 по Москве
const ORIGIN = DraftOrigin.meeting({ fileId: 'f1', recordingName: 'Планёрка 01.03.m4a' });

class CapturingRenderer extends DocumentRendererPort {
    readonly mediaType = DOCX_MEDIA_TYPE;
    readonly extension = '.docx';
    readonly rendered: DocumentModel[] = [];

    render(doc: DocumentModel): Promise<Buffer> {
        this.rendered.push(doc);
        return Promise.resolve(Buffer.from('docx-bytes'));
    }
}

class CapturingStore extends GeneratedDocumentStore {
    readonly stored: GeneratedDocumentInput[] = [];

    store = vi.fn((input: GeneratedDocumentInput): Promise<StoredFileView> => {
        this.stored.push(input);
        return Promise.resolve({
            id: 'file-9',
            name: input.name,
            mediaType: input.mediaType,
            kind: 'document',
            sizeBytes: input.buffer.length,
            status: 'active',
            awaitingProcessing: false,
            uploadedAt: POSTED_AT,
            expiresAt: null,
            deletedAt: null,
        });
    });
}

let renderer: CapturingRenderer;
let store: CapturingStore;
let directory: FakeUserDirectory;
let report: TasksReportDocument;

beforeEach(() => {
    renderer = new CapturingRenderer();
    store = new CapturingStore();
    directory = new FakeUserDirectory([
        { id: 'me', login: 'ivanov' },
        { id: 'anna', login: 'anna.petrova' },
    ]);
    report = new TasksReportDocument(
        renderer,
        store,
        directory,
        { now: () => POSTED_AT },
        silentLogger(),
    );
});

function table(doc: DocumentModel): TableBlock {
    const block = doc.blocks.find((b): b is TableBlock => b.kind === 'table');
    if (block === undefined) throw new Error('No table in the document');
    return block;
}

describe('TasksReportDocument', () => {
    // «вторую не надо»: исключённая задача не попадает в черновик, поэтому и в документ.
    const items = [
        DraftTaskItem.of({
            title: 'Подготовить КП',
            creatorId: 'me',
            assigneeId: 'anna',
            deadline: new Date('2026-03-05T20:59:00Z'),
        }),
        DraftTaskItem.of({ title: 'Позвонить клиенту', creatorId: 'anna', assigneeId: 'gone' }),
        DraftTaskItem.of({ title: 'Сверить бюджет', creatorId: 'me' }),
    ];
    const result = TaskBatchResult.of([
        { index: 1, status: 'created', taskId: 't1' },
        { index: 2, status: 'failed', reason: 'исполнитель отключён' },
        { index: 3, status: 'created', taskId: 't3' },
    ]);

    it('builds the «Поставленные задачи» table with user names and results', async () => {
        await report.issue({ ownerId: 'me', origin: ORIGIN, result, items });

        const [doc] = renderer.rendered;
        expect(doc.title).toBe('Поставленные задачи — Планёрка 01.03');
        expect(doc.blocks).toContainEqual({
            kind: 'paragraph',
            text: 'Дата постановки: 02.03.2026',
        });
        expect(table(doc)).toEqual({
            kind: 'table',
            header: ['№', 'Задача', 'Исполнитель', 'Постановщик', 'Срок', 'Результат'],
            rows: [
                ['1', 'Подготовить КП', 'anna.petrova', 'ivanov', '05.03.2026', 'Создана'],
                [
                    '2',
                    'Позвонить клиенту',
                    null,
                    'anna.petrova',
                    null,
                    'Не создана: исполнитель отключён',
                ],
                ['3', 'Сверить бюджет', null, 'ivanov', null, 'Создана'],
            ],
        });
    });

    it('has only the tasks of the draft, in their order', async () => {
        const kept = [items[0], items[2]];
        const keptResult = TaskBatchResult.of([
            { index: 1, status: 'created', taskId: 't1' },
            { index: 2, status: 'created', taskId: 't3' },
        ]);

        await report.issue({ ownerId: 'me', origin: ORIGIN, result: keptResult, items: kept });

        const rows = table(renderer.rendered[0]).rows;
        expect(rows.map((r) => r[1])).toEqual(['Подготовить КП', 'Сверить бюджет']);
        expect(rows.map((r) => r[0])).toEqual(['1', '2']);
    });

    it('stores the file as a document of the owner and returns it', async () => {
        const file = await report.issue({ ownerId: 'me', origin: ORIGIN, result, items });

        expect(store.stored).toEqual([
            {
                ownerId: 'me',
                name: 'Поставленные задачи — Планёрка 01.03.docx',
                mediaType: DOCX_MEDIA_TYPE,
                buffer: Buffer.from('docx-bytes'),
            },
        ]);
        expect(file.id).toBe('file-9');
        expect(file.name).toBe('Поставленные задачи — Планёрка 01.03.docx');
    });

    it('is issued even when no task was created', async () => {
        const none = TaskBatchResult.of([{ index: 1, status: 'failed', reason: 'нет прав' }]);

        await report.issue({ ownerId: 'me', origin: ORIGIN, result: none, items: [items[0]] });

        expect(table(renderer.rendered[0]).rows[0][5]).toBe('Не создана: нет прав');
        expect(store.store).toHaveBeenCalledTimes(1);
    });

    it('looks the users up with a single directory call', async () => {
        await report.issue({ ownerId: 'me', origin: ORIGIN, result, items });

        expect(directory.findActiveByIds).toHaveBeenCalledTimes(1);
    });
});
