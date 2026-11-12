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
import { RetryMeetingTranscriptionUseCase } from '../../application/retry-meeting-transcription.use-case';
import { MeetingTranscriptNotRetryableError } from '../../domain/errors';
import { registerMeetingTranscriptionErrorStatuses } from '../meeting-transcription-error-status';
import { MeetingTranscriptsController } from './meeting-transcripts.controller';
import { MeetingTranscriptResponse } from './meeting-transcripts.responses';

const FILE_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const getTranscript = { execute: vi.fn() };
const retryTranscription = { execute: vi.fn() };

const completed: MeetingTranscriptView = {
    fileId: FILE_ID,
    status: 'completed',
    failureReason: null,
    language: 'ru',
    durationSec: 9,
    speakerCount: 2,
    segments: [
        { speaker: 'Спикер 1', start: 0, end: 4, text: 'Привет' },
        { speaker: 'Спикер 2', start: 4, end: 9, text: 'Согласен' },
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
                segments: null,
                completedAt: null,
            });

            const response = await get();

            expect(response.status).toBe(200);
            const body = z
                .object({ status: z.string(), segments: z.unknown() })
                .parse(await response.json());
            expect(body.status).toBe('processing');
            expect(body.segments).toBeNull();
        });

        it('answers 200 with file-deleted for a recording deleted before the end', async () => {
            getTranscript.execute.mockResolvedValue({
                ...completed,
                status: 'failed',
                failureReason: 'file-deleted',
                language: null,
                durationSec: null,
                speakerCount: 0,
                segments: [],
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
