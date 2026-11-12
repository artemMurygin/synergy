import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../../shared/errors';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { MeetingTranscriptNotFoundError } from './errors';
import { GetMeetingTranscriptUseCase } from './get-meeting-transcript.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const CREATED = new Date('2026-11-12T09:00:00Z');
const DONE = new Date('2026-11-12T09:05:00Z');

const pending = (): MeetingTranscript =>
    MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: CREATED });

const SEGMENTS = [
    TranscriptSegment.of({ seq: 0, speaker: 1, startSec: 0, endSec: 4, text: 'Привет' }),
    TranscriptSegment.of({ seq: 1, speaker: 2, startSec: 4, endSec: 9, text: 'Согласен' }),
];

const dialog = (): DiarizedTranscript =>
    DiarizedTranscript.of({ language: 'ru', durationSec: 9, segments: SEGMENTS });

describe('GetMeetingTranscriptUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let useCase: GetMeetingTranscriptUseCase;

    async function completed(): Promise<MeetingTranscript> {
        const transcript = pending();
        transcript.start();
        transcript.complete(dialog(), DONE);
        await transcripts.save(transcript);
        await segments.insertAll(FILE_ID, SEGMENTS);
        return transcript;
    }

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        segments = new InMemoryTranscriptSegmentRepository();
        useCase = new GetMeetingTranscriptUseCase(transcripts, segments);
    });

    it('returns the status without segments and speakers while processing', async () => {
        const transcript = pending();
        transcript.start();
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view).toEqual({
            fileId: FILE_ID,
            status: 'processing',
            failureReason: null,
            language: null,
            durationSec: null,
            speakerCount: 0,
            speakers: null,
            segments: null,
            completedAt: null,
        });
    });

    it('returns segments of a completed transcript ordered by seq', async () => {
        await completed();

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.status).toBe('completed');
        expect(view.language).toBe('ru');
        expect(view.durationSec).toBe(9);
        expect(view.speakerCount).toBe(2);
        expect(view.completedAt).toEqual(DONE);
        expect(view.segments).toEqual([
            { seq: 0, speaker: 1, startSec: 0, endSec: 4, text: 'Привет' },
            { seq: 1, speaker: 2, startSec: 4, endSec: 9, text: 'Согласен' },
        ]);
    });

    it('lists speakers of a completed transcript with names and talk time', async () => {
        const transcript = await completed();
        transcript.assignSpeakers([{ speaker: 1, name: 'Анна' }]);
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.speakers).toEqual([
            { speaker: 1, name: 'Анна', talkSec: 4, talkShare: 0.444 },
            { speaker: 2, name: null, talkSec: 5, talkShare: 0.556 },
        ]);
        expect(view.segments?.map((s) => s.speaker)).toEqual([1, 2]);
    });

    it('returns empty segments and speakers for no_speech', async () => {
        const transcript = pending();
        transcript.start();
        transcript.complete(
            DiarizedTranscript.of({ language: null, durationSec: 30, segments: [] }),
            DONE,
        );
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.status).toBe('no_speech');
        expect(view.segments).toEqual([]);
        expect(view.speakers).toEqual([]);
    });

    it('returns the failure reason of a failed transcript without speakers', async () => {
        const transcript = pending();
        transcript.start();
        transcript.fail('too-long', DONE);
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.status).toBe('failed');
        expect(view.failureReason).toBe('too-long');
        expect(view.segments).toBeNull();
        expect(view.speakers).toBeNull();
    });

    it('rejects a transcript of another owner with 404', async () => {
        await transcripts.save(pending());

        const result = useCase.execute({ ownerId: 'owner-2', fileId: FILE_ID });

        await expect(result).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
        await expect(result).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects a missing transcript with 404', async () => {
        await expect(
            useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
    });

    // Use case читает только таблицы расшифровки, поэтому удаление файла её не затрагивает.
    it('stays available after the recording is deleted', async () => {
        await completed();

        expect(GetMeetingTranscriptUseCase.length).toBe(2);
        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });
        expect(view.segments).toHaveLength(2);
    });
});
