import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../../../shared/errors';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import { TranscriptNotReadyError } from '../domain/errors';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { MeetingTranscriptNotFoundError } from './errors';
import { GetSpeakerSamplesUseCase } from './get-speaker-samples.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const T0 = new Date('2026-11-12T09:00:00Z');
const T1 = new Date('2026-11-12T10:00:00Z');

let seq = 0;
function seg(speaker: number, startSec: number, endSec: number, text: string): TranscriptSegment {
    return TranscriptSegment.of({ seq: seq++, speaker, startSec, endSec, text });
}

// Запись 900 с: трети [0, 300), [300, 600), [600, 900).
seq = 0;
const SEGMENTS = [
    seg(1, 0, 60, 'Первая длинная реплика Анны в начале встречи про бюджет'),
    seg(1, 60, 70, 'Коротко'),
    seg(2, 70, 100, 'Олег отвечает в начале'),
    seg(1, 100, 200, 'Самая длинная реплика Анны в первой трети, очень подробная и обстоятельная'),
    seg(1, 300, 400, 'Анна в середине говорит про сроки проекта'),
    seg(2, 400, 450, 'Олег в середине'),
    seg(1, 600, 700, 'Анна в конце подводит итоги'),
    seg(2, 700, 900, 'Олег в конце встречи прощается со всеми'),
];

describe('GetSpeakerSamplesUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let useCase: GetSpeakerSamplesUseCase;

    async function seed(
        status: 'completed' | 'processing' | 'no_speech',
        names: [number, string][] = [],
    ): Promise<void> {
        const t = MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
        t.start();
        if (status !== 'processing') {
            const list = status === 'completed' ? SEGMENTS : [];
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 900, segments: list }),
                T1,
            );
            await segments.insertAll(FILE_ID, list);
            if (status === 'completed') {
                t.assignSpeakers(names.map(([speaker, name]) => ({ speaker, name })));
            }
        }
        await transcripts.save(t);
    }

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        segments = new InMemoryTranscriptSegmentRepository();
        useCase = new GetSpeakerSamplesUseCase(transcripts, segments);
    });

    it('returns every speaker with the name and the share of speech', async () => {
        await seed('completed', [[1, 'Анна']]);

        const { speakers } = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(speakers).toEqual([
            { speaker: 1, name: 'Анна', talkSec: 370, talkShare: 0.569 },
            { speaker: 2, name: null, talkSec: 280, talkShare: 0.431 },
        ]);
    });

    it('returns up to three samples per speaker from different parts of the recording', async () => {
        await seed('completed');

        const { samples } = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        const anna = samples.filter((s) => s.speaker === 1);
        const oleg = samples.filter((s) => s.speaker === 2);
        expect(anna.map((s) => s.startSec)).toEqual([100, 300, 600]);
        expect(oleg.map((s) => s.startSec)).toEqual([70, 400, 700]);
        expect(samples.map((s) => s.seq)).toEqual(
            [...samples.map((s) => s.seq)].sort((a, b) => a - b),
        );
    });

    it('gives fewer samples to a speaker with fewer replicas', async () => {
        seq = 0;
        const short = [
            seg(1, 0, 10, 'Анна одна-единственная реплика'),
            seg(2, 10, 20, 'Олег раз'),
            seg(2, 20, 30, 'Олег два'),
        ];
        const t = MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
        t.start();
        t.complete(DiarizedTranscript.of({ language: 'ru', durationSec: 30, segments: short }), T1);
        await segments.insertAll(FILE_ID, short);
        await transcripts.save(t);

        const { samples } = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(samples.filter((s) => s.speaker === 1)).toHaveLength(1);
        expect(samples.filter((s) => s.speaker === 2)).toHaveLength(2);
    });

    it.each([
        ['foreign', 'owner-2'],
        ['missing', OWNER_ID],
    ])('rejects a %s transcript with 404', async (kind, ownerId) => {
        if (kind === 'foreign') await seed('completed');

        const result = useCase.execute({ ownerId, fileId: FILE_ID });

        await expect(result).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
        await expect(result).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(['processing', 'no_speech'] as const)(
        'rejects a transcript in status %s with 409',
        async (status) => {
            await seed(status);

            const result = useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

            await expect(result).rejects.toBeInstanceOf(TranscriptNotReadyError);
            await expect(result).rejects.toBeInstanceOf(ConflictError);
        },
    );
});
