import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../database/postgres/testing/in-memory-transaction-runner';
import { DOCX_MEDIA_TYPE, type DocumentModel, type TableBlock } from '../../../../shared/documents';
import { ConflictError, NotFoundError } from '../../../../shared/errors';
import { recordingLogger, type RecordingLogger } from '../../application/test-doubles';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import type { ExtractedMeetingTask } from '../domain/extracted-meeting-task';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import {
    blockText,
    FakeDocumentRenderer,
    recordingFiles,
    storeGeneratedFileDouble,
    type RecordingFilesFixture,
    type StoreGeneratedFileDouble,
} from '../testing/meeting-document-doubles';
import { MeetingTranscriptNotFoundError } from './errors';
import { MeetingFiles } from '../infrastructure/files/meeting-files';
import { MeetingDocuments } from './meeting-documents';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
// 00:30 по Москве 11 ноября: дата загрузки должна считаться по Москве.
const UPLOADED_AT = new Date('2026-11-10T21:30:00Z');
const T0 = new Date('2026-11-10T21:31:00Z');
const T1 = new Date('2026-11-10T22:00:00Z');

const SEGMENTS = [
    TranscriptSegment.of({ seq: 0, speaker: 1, startSec: 0, endSec: 5, text: 'Добрый день' }),
    TranscriptSegment.of({ seq: 1, speaker: 1, startSec: 5, endSec: 8, text: 'Начнём встречу' }),
    TranscriptSegment.of({
        seq: 2,
        speaker: 2,
        startSec: 65.4,
        endSec: 70,
        text: 'Я подготовил смету',
    }),
    TranscriptSegment.of({ seq: 3, speaker: 4, startSec: 70, endSec: 75, text: 'И договор тоже' }),
    TranscriptSegment.of({
        seq: 4,
        speaker: 3,
        startSec: 3725.6,
        endSec: 3730,
        text: 'Вопрос по срокам',
    }),
    TranscriptSegment.of({ seq: 5, speaker: 1, startSec: 3730, endSec: 3735, text: 'Хорошо' }),
];

const TASKS: ExtractedMeetingTask[] = [
    {
        title: 'Подготовить смету',
        description: 'Смета по проекту',
        assigneeMention: 'Олег',
        due: new Date('2026-11-13T15:00:00Z'),
        evidence: { seq: 2, startSec: 65.4, speakerLabel: 'Олег', quote: 'Я подготовил смету' },
    },
    {
        title: 'Обновить договор',
        description: '',
        assigneeMention: null,
        due: null,
        evidence: { seq: 3, startSec: 70, speakerLabel: 'Олег', quote: 'договор тоже' },
    },
];

function replicas(doc: DocumentModel): string[] {
    return doc.blocks
        .filter((b) => b.kind === 'paragraph')
        .map(blockText)
        .filter((t) => t.startsWith('['));
}

function table(doc: DocumentModel): TableBlock {
    const block = doc.blocks.find((b) => b.kind === 'table');
    if (block?.kind !== 'table') throw new Error('no table in the document');
    return block;
}

describe('MeetingDocuments', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let renderer: FakeDocumentRenderer;
    let store: StoreGeneratedFileDouble;
    let recordings: RecordingFilesFixture;
    let log: RecordingLogger;
    let documents: MeetingDocuments;

    async function seed(
        status: 'completed' | 'processing',
        names: [number, string][] = [],
        recordingName = 'встреча.m4a',
    ): Promise<void> {
        recordings.addRecording({
            id: FILE_ID,
            ownerId: OWNER_ID,
            name: recordingName,
            uploadedAt: UPLOADED_AT,
        });
        const t = MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
        t.start();
        if (status === 'completed') {
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 3735, segments: SEGMENTS }),
                T1,
            );
            await segments.insertAll(FILE_ID, SEGMENTS);
            t.assignSpeakers(names.map(([speaker, name]) => ({ speaker, name })));
        }
        await transcripts.save(t);
    }

    async function rename(names: [number, string][]): Promise<void> {
        const t = await transcripts.findByFileId(FILE_ID);
        if (t === null) throw new Error('transcript is missing');
        t.assignSpeakers(names.map(([speaker, name]) => ({ speaker, name })));
        await transcripts.save(t);
    }

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        transcripts.transactions = new InMemoryTransactionRunner();
        segments = new InMemoryTranscriptSegmentRepository();
        renderer = new FakeDocumentRenderer();
        store = storeGeneratedFileDouble();
        recordings = recordingFiles();
        log = recordingLogger();
        documents = new MeetingDocuments(
            transcripts,
            segments,
            renderer,
            new MeetingFiles(recordings.getFile, store.store),
            log.logger,
        );
    });

    describe('issueTranscript', () => {
        it('builds the header with the upload date, duration and participants', async () => {
            await seed('completed', [
                [1, 'Анна'],
                [2, 'Олег'],
                [4, 'Олег'],
            ]);

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            const doc = renderer.last();
            expect(doc.title).toBe('Расшифровка — встреча');
            const texts = doc.blocks.map(blockText);
            expect(texts).toContain('Дата загрузки: 11.11.2026');
            expect(texts).toContain('Длительность: 01:02:15');
            expect(texts).toContain('Участники: Анна, Олег, Спикер 3');
        });

        it('writes replicas as "[чч:мм:сс] Имя: текст" and merges consecutive ones of one name', async () => {
            await seed('completed', [
                [1, 'Анна'],
                [2, 'Олег'],
                [4, 'Олег'],
            ]);

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(replicas(renderer.last())).toEqual([
                '[00:00:00] Анна: Добрый день Начнём встречу',
                '[00:01:05] Олег: Я подготовил смету И договор тоже',
                '[01:02:05] Спикер 3: Вопрос по срокам',
                '[01:02:10] Анна: Хорошо',
            ]);
        });

        it('labels unnamed speakers and keeps two different speakers apart', async () => {
            await seed('completed', [[1, 'Анна']]);

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            const doc = renderer.last();
            expect(doc.blocks.map(blockText)).toContain(
                'Участники: Анна, Спикер 2, Спикер 3, Спикер 4',
            );
            expect(replicas(doc).slice(1, 3)).toEqual([
                '[00:01:05] Спикер 2: Я подготовил смету',
                '[00:01:10] Спикер 4: И договор тоже',
            ]);
        });

        it('stores the document under the name pattern as a .docx of the owner', async () => {
            await seed('completed');

            const view = await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(store.calls).toHaveLength(1);
            expect(store.calls[0]).toMatchObject({
                ownerId: OWNER_ID,
                name: 'Расшифровка — встреча.docx',
                mediaType: DOCX_MEDIA_TYPE,
            });
            expect(store.calls[0]?.buffer.length).toBe(2048);
            expect(view).toMatchObject({ id: 'generated-1', name: 'Расшифровка — встреча.docx' });
        });

        it.each([
            ['Планёрка', 'Расшифровка — Планёрка.docx'],
            ['отчёт.за.май.mp3', 'Расшифровка — отчёт.за.май.docx'],
        ])('strips only the last extension of "%s"', async (recordingName, expected) => {
            await seed('completed', [], recordingName);

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(store.calls[0]?.name).toBe(expected);
        });

        it('creates a new file on every call with the names at the time of the call', async () => {
            await seed('completed', [[2, 'Олег']]);

            const first = await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });
            await rename([[2, 'Игорь']]);
            const second = await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(store.calls).toHaveLength(2);
            expect(first.id).not.toBe(second.id);
            expect(replicas(renderer.rendered[0])[1]).toContain('Олег:');
            expect(replicas(renderer.rendered[1])[1]).toContain('Игорь:');
        });

        it('builds the document after the recording itself was deleted', async () => {
            await seed('completed', [[1, 'Анна']]);
            recordings.files.byId.get(FILE_ID)?.markDeleted(T1, 'retention');

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(renderer.last().title).toBe('Расшифровка — встреча');
            expect(replicas(renderer.last())).toHaveLength(5);
        });

        it.each([
            ['foreign', 'owner-2'],
            ['missing', OWNER_ID],
        ])('rejects a %s transcript with 404', async (kind, ownerId) => {
            if (kind === 'foreign') await seed('completed');

            const result = documents.issueTranscript({ ownerId, fileId: FILE_ID });

            await expect(result).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
            await expect(result).rejects.toBeInstanceOf(NotFoundError);
            expect(store.calls).toHaveLength(0);
        });

        it('rejects a transcript that is not completed with 409', async () => {
            await seed('processing');

            await expect(
                documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID }),
            ).rejects.toBeInstanceOf(ConflictError);
            expect(store.calls).toHaveLength(0);
        });

        it('logs the transcript id, the kind, the replica count and the size, but no text', async () => {
            await seed('completed', [
                [1, 'Анна'],
                [2, 'Олег'],
                [4, 'Олег'],
            ]);

            await documents.issueTranscript({ ownerId: OWNER_ID, fileId: FILE_ID });

            expect(log.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileId: FILE_ID,
                    kind: 'transcript',
                    count: 4,
                    sizeBytes: 2048,
                }),
                expect.any(String),
            );
            const dump = log.dump();
            for (const word of ['Добрый', 'смету', 'Анна', 'Олег', 'встреча']) {
                expect(dump).not.toContain(word);
            }
        });
    });

    describe('issueTasks', () => {
        it('builds a table of tasks with the meeting date and dashes for empty values', async () => {
            await seed('completed', [[2, 'Олег']]);

            await documents.issueTasks({ ownerId: OWNER_ID, fileId: FILE_ID, tasks: TASKS });

            const doc = renderer.last();
            expect(doc.title).toBe('Задачи — встреча');
            expect(doc.blocks.map(blockText)).toContain('Дата встречи: 11.11.2026');
            const { header, rows } = table(doc);
            expect(header).toEqual([
                '№',
                'Задача',
                'Описание',
                'Исполнитель',
                'Постановщик',
                'Срок',
                'Основание',
            ]);
            expect(rows).toEqual([
                [
                    '1',
                    'Подготовить смету',
                    'Смета по проекту',
                    'Олег',
                    null,
                    '13.11.2026 18:00',
                    '[00:01:05] Олег: «Я подготовил смету»',
                ],
                [
                    '2',
                    'Обновить договор',
                    null,
                    null,
                    null,
                    null,
                    '[00:01:10] Олег: «договор тоже»',
                ],
            ]);
        });

        it('stores the document under the name pattern', async () => {
            await seed('completed');

            const view = await documents.issueTasks({
                ownerId: OWNER_ID,
                fileId: FILE_ID,
                tasks: TASKS,
            });

            expect(store.calls[0]).toMatchObject({
                ownerId: OWNER_ID,
                name: 'Задачи — встреча.docx',
                mediaType: DOCX_MEDIA_TYPE,
            });
            expect(view.name).toBe('Задачи — встреча.docx');
        });

        it('creates a new file on every call', async () => {
            await seed('completed');

            const first = await documents.issueTasks({
                ownerId: OWNER_ID,
                fileId: FILE_ID,
                tasks: TASKS,
            });
            const second = await documents.issueTasks({
                ownerId: OWNER_ID,
                fileId: FILE_ID,
                tasks: TASKS,
            });

            expect(first.id).not.toBe(second.id);
            expect(store.calls).toHaveLength(2);
        });

        it('builds the document after the recording itself was deleted', async () => {
            await seed('completed');
            recordings.files.byId.get(FILE_ID)?.markDeleted(T1, 'owner');

            await documents.issueTasks({ ownerId: OWNER_ID, fileId: FILE_ID, tasks: TASKS });

            expect(table(renderer.last()).rows).toHaveLength(2);
        });

        it('rejects a foreign transcript with 404', async () => {
            await seed('completed');

            await expect(
                documents.issueTasks({ ownerId: 'owner-2', fileId: FILE_ID, tasks: TASKS }),
            ).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
            expect(store.calls).toHaveLength(0);
        });

        it('logs the kind and the task count, but no task text', async () => {
            await seed('completed');

            await documents.issueTasks({ ownerId: OWNER_ID, fileId: FILE_ID, tasks: TASKS });

            expect(log.info).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: FILE_ID, kind: 'tasks', count: 2 }),
                expect.any(String),
            );
            const dump = log.dump();
            for (const word of ['смет', 'договор', 'Олег', 'проекту']) {
                expect(dump).not.toContain(word);
            }
        });
    });
});
