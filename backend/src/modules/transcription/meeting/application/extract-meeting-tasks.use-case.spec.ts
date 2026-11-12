import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../shared/errors';
import { recordingLogger, type RecordingLogger } from '../../application/test-doubles';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import type { RawExtractedTask } from '../domain/extracted-meeting-task';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { FakeTaskExtractor } from '../testing/fake-task-extractor';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { MeetingFiles } from '../infrastructure/files/meeting-files';
import {
    recordingFiles,
    storeGeneratedFileDouble,
    type RecordingFilesFixture,
} from '../testing/meeting-document-doubles';
import { MeetingTranscriptNotFoundError } from './errors';
import {
    type ExtractMeetingTasksSettings,
    ExtractMeetingTasksUseCase,
} from './extract-meeting-tasks.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
// Запись загружена в среду, 14 января 2026: сроки считаются от этой даты.
const UPLOADED_AT = new Date('2026-01-14T09:00:00Z');
const T1 = new Date('2026-01-14T10:00:00Z');

const SHORT = [
    TranscriptSegment.of({
        seq: 0,
        speaker: 1,
        startSec: 0,
        endSec: 6,
        text: 'Олег, подготовь смету до пятницы.',
    }),
    TranscriptSegment.of({ seq: 1, speaker: 2, startSec: 6, endSec: 9, text: 'Хорошо, сделаю.' }),
    TranscriptSegment.of({
        seq: 2,
        speaker: 1,
        startSec: 65,
        endSec: 70,
        text: 'И надо обновить договор с поставщиком.',
    }),
];

/** Сегмент каждую минуту в течение 25 минут. */
const LONG = Array.from({ length: 25 }, (_, i) =>
    TranscriptSegment.of({
        seq: i,
        speaker: (i % 2) + 1,
        startSec: i * 60,
        endSec: i * 60 + 30,
        text: `Реплика номер ${String(i)} про работу`,
    }),
);

const SMETA: RawExtractedTask = {
    title: 'Подготовить смету',
    description: 'Смета по проекту',
    assigneeMention: 'Олег',
    dueText: 'до пятницы',
    evidence: { seq: 0, quote: 'подготовь смету до пятницы' },
};

const DOGOVOR: RawExtractedTask = {
    title: 'Обновить договор',
    description: 'Договор с поставщиком',
    assigneeMention: null,
    dueText: null,
    evidence: { seq: 2, quote: 'надо обновить договор с поставщиком' },
};

const INVENTED: RawExtractedTask = {
    title: 'Купить сервер',
    description: '',
    assigneeMention: 'Иван',
    dueText: 'завтра',
    evidence: { seq: 1, quote: 'Иван купит сервер' },
};

describe('ExtractMeetingTasksUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let recordings: RecordingFilesFixture;
    let log: RecordingLogger;
    let settings: ExtractMeetingTasksSettings;

    function useCase(extractor: FakeTaskExtractor): ExtractMeetingTasksUseCase {
        return new ExtractMeetingTasksUseCase(
            transcripts,
            segments,
            extractor,
            new MeetingFiles(recordings.getFile, storeGeneratedFileDouble().store),
            settings,
            log.logger,
        );
    }

    async function seed(
        status: 'completed' | 'processing' | 'no_speech',
        list: readonly TranscriptSegment[] = SHORT,
        names: [number, string][] = [],
    ): Promise<void> {
        recordings.addRecording({
            id: FILE_ID,
            ownerId: OWNER_ID,
            name: 'встреча.m4a',
            uploadedAt: UPLOADED_AT,
        });
        const t = MeetingTranscript.createPending({
            fileId: FILE_ID,
            ownerId: OWNER_ID,
            now: UPLOADED_AT,
        });
        t.start();
        if (status !== 'processing') {
            const content = status === 'completed' ? [...list] : [];
            const durationSec = Math.max(1, ...content.map((s) => s.endSec));
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec, segments: content }),
                T1,
            );
            await segments.insertAll(FILE_ID, content);
            if (status === 'completed') {
                t.assignSpeakers(names.map(([speaker, name]) => ({ speaker, name })));
            }
        }
        await transcripts.save(t);
    }

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        segments = new InMemoryTranscriptSegmentRepository();
        recordings = recordingFiles();
        log = recordingLogger();
        settings = { windowTokens: 60_000, windowSec: 30 * 60, overlapSec: 2 * 60 };
    });

    it('processes a short transcript in one call with numbered lines and speaker names', async () => {
        await seed('completed', SHORT, [[2, 'Олег']]);
        const extractor = new FakeTaskExtractor(() => [SMETA, DOGOVOR]);

        await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(extractor.extractions).toHaveLength(1);
        expect(extractor.merges).toHaveLength(0);
        expect(extractor.extractions[0]?.lines).toEqual([
            '[0] [00:00:00] Спикер 1: Олег, подготовь смету до пятницы.',
            '[1] [00:00:06] Олег: Хорошо, сделаю.',
            '[2] [00:01:05] Спикер 1: И надо обновить договор с поставщиком.',
        ]);
        expect(extractor.extractions[0]?.context).toEqual({
            participants: ['Спикер 1', 'Олег'],
            meetingDate: UPLOADED_AT,
        });
    });

    it('returns validated tasks with evidence and the due date counted from the upload date', async () => {
        await seed('completed', SHORT, [[2, 'Олег']]);
        const extractor = new FakeTaskExtractor(() => [SMETA, INVENTED, DOGOVOR]);

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(tasks).toEqual([
            {
                title: 'Подготовить смету',
                description: 'Смета по проекту',
                assigneeMention: 'Олег',
                // Пятница, 16 января 2026, 18:00 по Москве.
                due: new Date('2026-01-16T15:00:00Z'),
                evidence: {
                    seq: 0,
                    startSec: 0,
                    speakerLabel: 'Спикер 1',
                    quote: 'подготовь смету до пятницы',
                },
            },
            {
                title: 'Обновить договор',
                description: 'Договор с поставщиком',
                assigneeMention: null,
                due: null,
                evidence: {
                    seq: 2,
                    startSec: 65,
                    speakerLabel: 'Спикер 1',
                    quote: 'надо обновить договор с поставщиком',
                },
            },
        ]);
    });

    it('gives an empty list when there are no tasks', async () => {
        await seed('completed');
        const extractor = new FakeTaskExtractor(() => []);

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(tasks).toEqual([]);
    });

    it('gives an empty list for a transcript without speech and calls no model', async () => {
        await seed('no_speech');
        const extractor = new FakeTaskExtractor(() => [SMETA]);

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(tasks).toEqual([]);
        expect(extractor.extractions).toHaveLength(0);
    });

    it('splits a long transcript into overlapping windows and merges the results', async () => {
        await seed('completed', LONG);
        settings = { windowTokens: 50, windowSec: 10 * 60, overlapSec: 2 * 60 };
        const fromWindow = (seq: number): RawExtractedTask => ({
            title: `Задача ${String(seq)}`,
            description: '',
            assigneeMention: null,
            dueText: null,
            evidence: { seq, quote: `реплика номер ${String(seq)}` },
        });
        const extractor = new FakeTaskExtractor(
            (lines, call) => [fromWindow([3, 11, 22][call] ?? 0)],
            (batches) => [
                ...batches.flat(),
                { ...fromWindow(5), evidence: { seq: 99, quote: 'x' } },
            ],
        );

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        // Окна по 10 минут с перекрытием 2 минуты: [0, 12), [10, 22), [20, 25).
        const seqs = extractor.extractions.map((e) =>
            e.lines.map((l) => Number(/^\[(\d+)\]/.exec(l)?.[1])),
        );
        expect(seqs).toEqual([
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
            [20, 21, 22, 23, 24],
        ]);
        expect(extractor.merges).toHaveLength(1);
        expect(extractor.merges[0]?.map((b) => b.map((t) => t.title))).toEqual([
            ['Задача 3'],
            ['Задача 11'],
            ['Задача 22'],
        ]);
        // Слияние тоже проходит проверку основания.
        expect(tasks.map((t) => t.title)).toEqual(['Задача 3', 'Задача 11', 'Задача 22']);
    });

    it('sends the windows to the extractor at once, not one after another', async () => {
        await seed('completed', LONG);
        settings = { windowTokens: 50, windowSec: 10 * 60, overlapSec: 2 * 60 };
        const extractor = new FakeTaskExtractor();
        let release: () => void = () => undefined;
        const allCalled = new Promise<void>((resolve) => {
            release = resolve;
        });
        const extract = extractor.extract.bind(extractor);
        extractor.extract = async (lines, context) => {
            const result = extract(lines, context);
            if (extractor.extractions.length === 3) release();
            await allCalled;
            return result;
        };

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(tasks).toEqual([]);
        expect(extractor.extractions).toHaveLength(3);
    });

    it('does not call the merge when the windows found nothing', async () => {
        await seed('completed', LONG);
        settings = { windowTokens: 50, windowSec: 10 * 60, overlapSec: 2 * 60 };
        const extractor = new FakeTaskExtractor(() => []);

        const tasks = await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(tasks).toEqual([]);
        expect(extractor.extractions).toHaveLength(3);
        expect(extractor.merges).toHaveLength(0);
    });

    it.each([
        ['foreign', 'owner-2'],
        ['missing', OWNER_ID],
    ])('rejects a %s transcript with 404', async (kind, ownerId) => {
        if (kind === 'foreign') await seed('completed');
        const extractor = new FakeTaskExtractor(() => [SMETA]);

        const result = useCase(extractor).execute({ ownerId, fileId: FILE_ID });

        await expect(result).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
        await expect(result).rejects.toBeInstanceOf(NotFoundError);
        expect(extractor.extractions).toHaveLength(0);
    });

    it('rejects a transcript that is not ready with 409', async () => {
        await seed('processing');
        const extractor = new FakeTaskExtractor(() => [SMETA]);

        await expect(
            useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(extractor.extractions).toHaveLength(0);
    });

    it('logs counts of found and dropped tasks, but no text', async () => {
        await seed('completed', SHORT, [[2, 'Олег']]);
        const extractor = new FakeTaskExtractor(() => [SMETA, INVENTED, DOGOVOR]);

        await useCase(extractor).execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ fileId: FILE_ID, windows: 1, found: 3, kept: 2, dropped: 1 }),
            expect.any(String),
        );
        const dump = log.dump();
        for (const word of ['смет', 'договор', 'Олег', 'сервер']) {
            expect(dump).not.toContain(word);
        }
    });
});
