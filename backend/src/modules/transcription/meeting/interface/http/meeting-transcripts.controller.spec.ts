import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECORATORS } from '@nestjs/swagger';
import { z } from 'zod';
import { FileGoneError } from '../../../../files/domain/errors';
import {
    type HttpFixture,
    startHttpFixture,
    USER_ID,
} from '../../../../files/interface/http/testing/http-fixture';
import { MeetingTranscriptNotFoundError } from '../../application/errors';
import { GetMeetingTranscriptUseCase } from '../../application/get-meeting-transcript.use-case';
import type { MeetingTranscriptView } from '../../application/meeting-transcript-view';
import { RenameSpeakersUseCase } from '../../application/rename-speakers.use-case';
import { RetryMeetingTranscriptionUseCase } from '../../application/retry-meeting-transcription.use-case';
import {
    InvalidSpeakerNameError,
    MeetingTranscriptNotRetryableError,
    TranscriptNotReadyError,
    UnknownSpeakerError,
} from '../../domain/errors';
import { registerMeetingTranscriptionErrorStatuses } from '../meeting-transcription-error-status';
import { MeetingTranscriptsController } from './meeting-transcripts.controller';
import { MeetingTranscriptResponse } from './meeting-transcripts.responses';

const FILE_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const getTranscript = { execute: vi.fn() };
const retryTranscription = { execute: vi.fn() };
const renameSpeakers = { execute: vi.fn() };

const SPEAKERS = [
    { speaker: 1, name: 'Анна', talkSec: 4, talkShare: 0.444 },
    { speaker: 2, name: null, talkSec: 5, talkShare: 0.556 },
];

const completed: MeetingTranscriptView = {
    fileId: FILE_ID,
    status: 'completed',
    failureReason: null,
    language: 'ru',
    durationSec: 9,
    speakerCount: 2,
    speakers: SPEAKERS,
    segments: [
        { seq: 0, speaker: 1, startSec: 0, endSec: 4, text: 'Привет' },
        { seq: 1, speaker: 2, startSec: 4, endSec: 9, text: 'Согласен' },
    ],
    completedAt: new Date('2026-11-12T09:05:00.000Z'),
};

const codeOf = async (response: Response): Promise<string> =>
    z.object({ code: z.string() }).parse(await response.json()).code;

describe('MeetingTranscriptsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        registerMeetingTranscriptionErrorStatuses();
        fixture = await startHttpFixture({
            controllers: [MeetingTranscriptsController],
            providers: [
                { provide: GetMeetingTranscriptUseCase, useValue: getTranscript },
                { provide: RetryMeetingTranscriptionUseCase, useValue: retryTranscription },
                { provide: RenameSpeakersUseCase, useValue: renameSpeakers },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        getTranscript.execute.mockResolvedValue(completed);
        retryTranscription.execute.mockResolvedValue(undefined);
        renameSpeakers.execute.mockResolvedValue(SPEAKERS);
    });

    const putSpeakers = (
        body: unknown,
        id = FILE_ID,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> =>
        fetch(`${fixture.base}/transcripts/${id}/speakers`, {
            method: 'PUT',
            headers: { ...headers, 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });

    const get = (id = FILE_ID, headers = fixture.bearer()): Promise<Response> =>
        fetch(`${fixture.base}/transcripts/${id}`, { headers });

    const retry = (id = FILE_ID, headers = fixture.bearer()): Promise<Response> =>
        fetch(`${fixture.base}/transcripts/${id}/retry`, { method: 'POST', headers });

    describe('GET /transcripts/:fileId', () => {
        it('answers 200 with segments of the own transcript', async () => {
            const response = await get();

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                ...completed,
                completedAt: '2026-11-12T09:05:00.000Z',
            });
            expect(getTranscript.execute).toHaveBeenCalledWith({
                ownerId: USER_ID,
                fileId: FILE_ID,
            });
        });

        it('answers 200 with the status and without segments while processing', async () => {
            getTranscript.execute.mockResolvedValue({
                ...completed,
                status: 'processing',
                language: null,
                durationSec: null,
                speakerCount: 0,
                speakers: null,
                segments: null,
                completedAt: null,
            });

            const response = await get();

            expect(response.status).toBe(200);
            const body = z
                .object({ status: z.string(), segments: z.unknown(), speakers: z.unknown() })
                .parse(await response.json());
            expect(body.status).toBe('processing');
            expect(body.segments).toBeNull();
            expect(body.speakers).toBeNull();
        });

        it('answers 200 with file-deleted for a recording deleted before the end', async () => {
            getTranscript.execute.mockResolvedValue({
                ...completed,
                status: 'failed',
                failureReason: 'file-deleted',
                language: null,
                durationSec: null,
                speakerCount: 0,
                speakers: null,
                segments: null,
            });

            const response = await get();

            expect(response.status).toBe(200);
            const body = z
                .object({ status: z.string(), failureReason: z.string().nullable() })
                .parse(await response.json());
            expect(body).toEqual({ status: 'failed', failureReason: 'file-deleted' });
        });

        it('documents file-deleted among the failure reasons', () => {
            const property = z
                .object({ enum: z.array(z.string()) })
                .parse(
                    Reflect.getMetadata(
                        DECORATORS.API_MODEL_PROPERTIES,
                        MeetingTranscriptResponse.prototype,
                        'failureReason',
                    ),
                );
            expect(property.enum).toContain('file-deleted');
        });

        it('answers 404 for a foreign or missing transcript', async () => {
            getTranscript.execute.mockRejectedValue(new MeetingTranscriptNotFoundError(FILE_ID));

            const response = await get();

            expect(response.status).toBe(404);
            expect(await codeOf(response)).toBe('MEETING_TRANSCRIPT_NOT_FOUND');
        });

        it('answers 400 for a malformed id', async () => {
            expect((await get('not-a-uuid')).status).toBe(400);
            expect(getTranscript.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            expect((await get(FILE_ID, {})).status).toBe(401);
        });
    });

    describe('PUT /transcripts/:fileId/speakers', () => {
        it('answers 200 with the speakers and passes the owner and assignments', async () => {
            const response = await putSpeakers({
                speakers: [
                    { speaker: 1, name: 'Анна' },
                    { speaker: 2, name: null },
                ],
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ speakers: SPEAKERS });
            expect(renameSpeakers.execute).toHaveBeenCalledWith({
                ownerId: USER_ID,
                fileId: FILE_ID,
                assignments: [
                    { speaker: 1, name: 'Анна' },
                    { speaker: 2, name: null },
                ],
            });
        });

        it('treats an empty string as a reset passed through to the use case', async () => {
            await putSpeakers({ speakers: [{ speaker: 2, name: '' }] });

            expect(renameSpeakers.execute).toHaveBeenCalledWith(
                expect.objectContaining({ assignments: [{ speaker: 2, name: '' }] }),
            );
        });

        it.each([
            ['no body fields', {}],
            ['an empty list', { speakers: [] }],
            ['a non-integer speaker', { speakers: [{ speaker: 1.5, name: 'Анна' }] }],
            ['a string speaker', { speakers: [{ speaker: '1', name: 'Анна' }] }],
            ['a missing name', { speakers: [{ speaker: 1 }] }],
            ['a numeric name', { speakers: [{ speaker: 1, name: 5 }] }],
        ])('answers 400 for %s', async (_case, body) => {
            const response = await putSpeakers(body);

            expect(response.status).toBe(400);
            expect(renameSpeakers.execute).not.toHaveBeenCalled();
        });

        it('answers 422 for an unknown speaker', async () => {
            renameSpeakers.execute.mockRejectedValue(new UnknownSpeakerError([3]));

            const response = await putSpeakers({ speakers: [{ speaker: 3, name: 'Ира' }] });

            expect(response.status).toBe(422);
            const body = z
                .object({ code: z.string(), violations: z.array(z.string()) })
                .parse(await response.json());
            expect(body.code).toBe('MEETING_TRANSCRIPT_UNKNOWN_SPEAKER');
            expect(body.violations).toEqual(['Speaker 3 is not in the transcript']);
        });

        it('answers 422 for an invalid name', async () => {
            renameSpeakers.execute.mockRejectedValue(new InvalidSpeakerNameError('too long'));

            const response = await putSpeakers({
                speakers: [{ speaker: 1, name: 'я'.repeat(101) }],
            });

            expect(response.status).toBe(422);
            expect(await codeOf(response)).toBe('MEETING_TRANSCRIPT_INVALID_SPEAKER_NAME');
        });

        it('answers 409 when the transcript is not completed', async () => {
            renameSpeakers.execute.mockRejectedValue(new TranscriptNotReadyError('processing'));

            const response = await putSpeakers({ speakers: [{ speaker: 1, name: 'Анна' }] });

            expect(response.status).toBe(409);
            expect(await codeOf(response)).toBe('MEETING_TRANSCRIPT_NOT_READY');
        });

        it('answers 404 for a foreign or missing transcript', async () => {
            renameSpeakers.execute.mockRejectedValue(new MeetingTranscriptNotFoundError(FILE_ID));

            const response = await putSpeakers({ speakers: [{ speaker: 1, name: 'Анна' }] });

            expect(response.status).toBe(404);
        });

        it('answers 400 for a malformed id', async () => {
            const response = await putSpeakers(
                { speakers: [{ speaker: 1, name: 'Анна' }] },
                'not-a-uuid',
            );

            expect(response.status).toBe(400);
            expect(renameSpeakers.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            const response = await putSpeakers(
                { speakers: [{ speaker: 1, name: 'Анна' }] },
                FILE_ID,
                {},
            );

            expect(response.status).toBe(401);
        });
    });

    describe('POST /transcripts/:fileId/retry', () => {
        it('answers 202 and passes the owner', async () => {
            const response = await retry();

            expect(response.status).toBe(202);
            expect(retryTranscription.execute).toHaveBeenCalledWith({
                ownerId: USER_ID,
                fileId: FILE_ID,
            });
        });

        it('answers 409 when the transcript is not failed', async () => {
            retryTranscription.execute.mockRejectedValue(
                new MeetingTranscriptNotRetryableError('status is completed'),
            );

            const response = await retry();

            expect(response.status).toBe(409);
            expect(await codeOf(response)).toBe('MEETING_TRANSCRIPTION_NOT_RETRYABLE');
        });

        it('answers 410 when the recording is deleted', async () => {
            retryTranscription.execute.mockRejectedValue(new FileGoneError(FILE_ID));

            const response = await retry();

            expect(response.status).toBe(410);
            expect(await codeOf(response)).toBe('FILE_GONE');
        });

        it('answers 404 for a foreign or missing transcript', async () => {
            retryTranscription.execute.mockRejectedValue(
                new MeetingTranscriptNotFoundError(FILE_ID),
            );

            expect((await retry()).status).toBe(404);
        });

        it('answers 400 for a malformed id', async () => {
            expect((await retry('not-a-uuid')).status).toBe(400);
        });

        it('answers 401 without a token', async () => {
            expect((await retry(FILE_ID, {})).status).toBe(401);
        });
    });
});
