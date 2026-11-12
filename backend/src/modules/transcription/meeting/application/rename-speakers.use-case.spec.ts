import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../database/postgres/testing/in-memory-transaction-runner';
import { ConflictError, NotFoundError } from '../../../../shared/errors';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import {
    InvalidSpeakerNameError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from '../domain/errors';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { MeetingTranscriptNotFoundError } from './errors';
import { RenameSpeakersUseCase } from './rename-speakers.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const T0 = new Date('2026-11-12T09:00:00Z');
const T1 = new Date('2026-11-12T09:05:00Z');

const SEGMENTS = [
    TranscriptSegment.of({ seq: 0, speaker: 1, startSec: 0, endSec: 6, text: 'Добрый день' }),
    TranscriptSegment.of({ seq: 1, speaker: 2, startSec: 6, endSec: 8, text: 'Привет' }),
    TranscriptSegment.of({ seq: 2, speaker: 1, startSec: 8, endSec: 10, text: 'Начнём' }),
];

describe('RenameSpeakersUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let transactions: InMemoryTransactionRunner;
    let useCase: RenameSpeakersUseCase;

    async function stored(): Promise<MeetingTranscript> {
        const t = await transcripts.findByFileId(FILE_ID);
        if (t === null) throw new Error('transcript is missing');
        return t;
    }

    async function seed(status: 'completed' | 'processing' | 'no_speech'): Promise<void> {
        const t = MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: T0 });
        t.start();
        if (status !== 'processing') {
            const list = status === 'completed' ? SEGMENTS : [];
            t.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 10, segments: list }),
                T1,
            );
            await segments.insertAll(FILE_ID, list);
        }
        await transcripts.save(t);
    }

    beforeEach(() => {
        transactions = new InMemoryTransactionRunner();
        transcripts = new InMemoryMeetingTranscriptRepository();
        transcripts.transactions = transactions;
        segments = new InMemoryTranscriptSegmentRepository();
        useCase = new RenameSpeakersUseCase(transcripts, segments, transactions);
    });

    it('assigns names atomically and returns all speakers with their talk time', async () => {
        await seed('completed');

        const speakers = await useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [
                { speaker: 1, name: ' Анна ' },
                { speaker: 2, name: 'Олег' },
            ],
        });

        expect(speakers).toEqual([
            { speaker: 1, name: 'Анна', talkSec: 8, talkShare: 0.8 },
            { speaker: 2, name: 'Олег', talkSec: 2, talkShare: 0.2 },
        ]);
        expect((await stored()).speakerNames.entries()).toEqual([
            { speaker: 1, name: 'Анна' },
            { speaker: 2, name: 'Олег' },
        ]);
        expect(await segments.readAll(FILE_ID)).toEqual(SEGMENTS);
    });

    it('reads the transcript under the row lock inside a transaction', async () => {
        await seed('completed');

        await useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [{ speaker: 1, name: 'Анна' }],
        });

        expect(transcripts.lockedInTransaction).toEqual([true]);
    });

    it('resets a name with an empty value', async () => {
        await seed('completed');
        await useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [{ speaker: 2, name: 'Олег' }],
        });

        const speakers = await useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [{ speaker: 2, name: '' }],
        });

        expect(speakers[1]).toMatchObject({ speaker: 2, name: null });
        expect((await stored()).speakerNames.entries()).toEqual([]);
    });

    it.each([
        ['foreign', 'owner-2'],
        ['missing', OWNER_ID],
    ])('rejects a %s transcript with 404', async (kind, ownerId) => {
        if (kind === 'foreign') await seed('completed');

        const result = useCase.execute({
            ownerId,
            fileId: FILE_ID,
            assignments: [{ speaker: 1, name: 'Анна' }],
        });

        await expect(result).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
        await expect(result).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each(['processing', 'no_speech'] as const)(
        'rejects a transcript in status %s with 409',
        async (status) => {
            await seed(status);

            const result = useCase.execute({
                ownerId: OWNER_ID,
                fileId: FILE_ID,
                assignments: [{ speaker: 1, name: 'Анна' }],
            });

            await expect(result).rejects.toBeInstanceOf(TranscriptNotReadyError);
            await expect(result).rejects.toBeInstanceOf(ConflictError);
        },
    );

    it('rejects an unknown speaker with 422 and changes no name', async () => {
        await seed('completed');

        const result = useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [
                { speaker: 1, name: 'Анна' },
                { speaker: 3, name: 'Ира' },
            ],
        });

        await expect(result).rejects.toBeInstanceOf(UnknownSpeakerError);
        expect((await stored()).speakerNames.entries()).toEqual([]);
    });

    it('rejects an invalid name with 422 and changes no name', async () => {
        await seed('completed');

        const result = useCase.execute({
            ownerId: OWNER_ID,
            fileId: FILE_ID,
            assignments: [
                { speaker: 1, name: 'Анна' },
                { speaker: 2, name: 'я'.repeat(101) },
            ],
        });

        await expect(result).rejects.toBeInstanceOf(InvalidSpeakerNameError);
        expect((await stored()).speakerNames.entries()).toEqual([]);
    });
});
