import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '../../../../shared/errors';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { MeetingTranscriptNotFoundError } from './errors';
import { GetMeetingTranscriptUseCase } from './get-meeting-transcript.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const CREATED = new Date('2026-11-12T09:00:00Z');
const DONE = new Date('2026-11-12T09:05:00Z');

const pending = (): MeetingTranscript =>
    MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: OWNER_ID, now: CREATED });

const dialog = (): DiarizedTranscript =>
    DiarizedTranscript.of({
        language: 'ru',
        durationSec: 9,
        segments: [
            TranscriptSegment.of({ speaker: 'Спикер 1', start: 0, end: 4, text: 'Привет' }),
            TranscriptSegment.of({ speaker: 'Спикер 2', start: 4, end: 9, text: 'Согласен' }),
        ],
    });

describe('GetMeetingTranscriptUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let useCase: GetMeetingTranscriptUseCase;

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        useCase = new GetMeetingTranscriptUseCase(transcripts);
    });

    it('returns the status without segments while processing', async () => {
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
            segments: null,
            completedAt: null,
        });
    });

    it('returns segments of a completed transcript', async () => {
        const transcript = pending();
        transcript.start();
        transcript.complete(dialog(), DONE);
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.status).toBe('completed');
        expect(view.language).toBe('ru');
        expect(view.durationSec).toBe(9);
        expect(view.speakerCount).toBe(2);
        expect(view.completedAt).toEqual(DONE);
        expect(view.segments).toEqual([
            { speaker: 'Спикер 1', start: 0, end: 4, text: 'Привет' },
            { speaker: 'Спикер 2', start: 4, end: 9, text: 'Согласен' },
        ]);
    });

    it('returns the failure reason of a failed transcript', async () => {
        const transcript = pending();
        transcript.start();
        transcript.fail('too-long', DONE);
        await transcripts.save(transcript);

        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(view.status).toBe('failed');
        expect(view.failureReason).toBe('too-long');
        expect(view.segments).toBeNull();
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

    // Use case читает только таблицу расшифровок, поэтому удаление файла её не затрагивает.
    it('stays available after the recording is deleted', async () => {
        const transcript = pending();
        transcript.start();
        transcript.complete(dialog(), DONE);
        await transcripts.save(transcript);

        expect(GetMeetingTranscriptUseCase.length).toBe(1);
        const view = await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });
        expect(view.segments).toHaveLength(2);
    });
});
