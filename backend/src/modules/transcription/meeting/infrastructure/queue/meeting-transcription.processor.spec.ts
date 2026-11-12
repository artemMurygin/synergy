import { ConfigService } from '@nestjs/config';
import { UnrecoverableError, type Worker } from 'bullmq';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../../database/postgres/testing/in-memory-transaction-runner';
import { RequestContext } from '../../../../../shared/context/request-context';
import type { Env } from '../../../../../shared/config/env.schema';
import { OpenFileForProcessingUseCase } from '../../../../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    RecordingEventPublisher,
    silentLogger,
    testRetentionPolicy,
} from '../../../../files/application/test-doubles';
import { recordingLogger, type RecordingLogger } from '../../../application/test-doubles';
import { FailMeetingTranscriptionUseCase } from '../../application/fail-meeting-transcription.use-case';
import { TranscribeMeetingUseCase } from '../../application/transcribe-meeting.use-case';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../../domain/errors';
import { FakeMeetingTranscriber } from '../../testing/fake-meeting-transcriber';
import { FakeMeetingTranscriptionQueue } from '../../testing/fake-meeting-transcription-queue';
import { InMemoryMeetingTranscriptRepository } from '../../testing/in-memory-meeting-transcript.repository';
import {
    MeetingTranscriptionProcessor,
    type ProcessableJob,
} from './meeting-transcription.processor';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const JOB_TIMEOUT_MS = 60_000;

const ENV = {
    MEETING_TRANSCRIPTION_CONCURRENCY: 2,
    MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS: JOB_TIMEOUT_MS,
} satisfies Partial<Env>;

function job(
    attemptsMade: number,
    attempts?: number,
    data: unknown = { fileId: FILE_ID },
    finishedOn?: number,
): ProcessableJob {
    return {
        id: FILE_ID,
        data,
        attemptsMade,
        opts: attempts === undefined ? {} : { attempts },
        finishedOn,
    };
}

describe('MeetingTranscriptionProcessor', () => {
    let transcribe: TranscribeMeetingUseCase;
    let fail: FailMeetingTranscriptionUseCase;
    let execute: MockInstance<TranscribeMeetingUseCase['execute']>;
    let failExecute: MockInstance<FailMeetingTranscriptionUseCase['execute']>;
    let queue: FakeMeetingTranscriptionQueue;
    let log: RecordingLogger;

    const createProcessor = (env: Partial<Env> = ENV): MeetingTranscriptionProcessor =>
        new MeetingTranscriptionProcessor(
            transcribe,
            fail,
            queue,
            new ConfigService<Env, true>(env),
            log.logger,
        );

    beforeEach(() => {
        const transcripts = new InMemoryMeetingTranscriptRepository();
        const transactions = new InMemoryTransactionRunner();
        const events = new RecordingEventPublisher(transactions);
        const files = new InMemoryStoredFileRepository();
        const release = new ReleaseFileHoldUseCase(
            files,
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        transcribe = new TranscribeMeetingUseCase(
            transcripts,
            new FakeMeetingTranscriber(() => Promise.reject(new Error('unused'))),
            new OpenFileForProcessingUseCase(files, new InMemoryObjectStorage(), silentLogger()),
            release,
            transactions,
            events,
            silentLogger(),
        );
        fail = new FailMeetingTranscriptionUseCase(
            transcripts,
            release,
            transactions,
            events,
            silentLogger(),
        );
        execute = vi.spyOn(transcribe, 'execute').mockResolvedValue(undefined);
        failExecute = vi.spyOn(fail, 'execute').mockResolvedValue(undefined);
        queue = new FakeMeetingTranscriptionQueue();
        log = recordingLogger();
    });

    it.each([
        { attemptsMade: 0, attempts: 3, isFinalAttempt: false },
        { attemptsMade: 1, attempts: 3, isFinalAttempt: false },
        { attemptsMade: 2, attempts: 3, isFinalAttempt: true },
        { attemptsMade: 0, attempts: 1, isFinalAttempt: true },
        { attemptsMade: 0, attempts: undefined, isFinalAttempt: true },
    ])(
        'computes isFinalAttempt=$isFinalAttempt for attemptsMade=$attemptsMade of $attempts',
        async ({ attemptsMade, attempts, isFinalAttempt }) => {
            await createProcessor().process(job(attemptsMade, attempts));

            expect(execute).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: FILE_ID, isFinalAttempt }),
            );
        },
    );

    it('passes a job deadline that is not aborted yet', async () => {
        await createProcessor().process(job(0, 3));

        const [input] = execute.mock.calls[0];
        expect(input.deadline).toBeInstanceOf(AbortSignal);
        expect(input.deadline?.aborted).toBe(false);
    });

    it('restores the request context of the job that enqueued it', async () => {
        const requestIds = { requestId: 'req-1', correlationId: 'corr-1' };
        let seen: unknown;
        execute.mockImplementation(() => {
            seen = RequestContext.getIds();
            return Promise.resolve();
        });

        await createProcessor().process(job(0, 3, { fileId: FILE_ID, requestIds }));

        expect(seen).toEqual(requestIds);
    });

    it('turns a permanent error into UnrecoverableError', async () => {
        execute.mockRejectedValue(new TranscriptionPermanentError('unsupported-media'));

        await expect(createProcessor().process(job(0, 3))).rejects.toBeInstanceOf(
            UnrecoverableError,
        );
    });

    it('rethrows a temporary error as is so BullMQ retries the job', async () => {
        const error = new TranscriptionTemporaryError('provider returned 503');
        execute.mockRejectedValue(error);

        await expect(createProcessor().process(job(0, 3))).rejects.toBe(error);
    });

    it('rejects an invalid payload without retries', async () => {
        await expect(createProcessor().process(job(0, 3, { fileId: '' }))).rejects.toBeInstanceOf(
            UnrecoverableError,
        );
        expect(execute).not.toHaveBeenCalled();
    });

    describe('failed job', () => {
        it('fails an unfinished transcript when the job failed for good', async () => {
            await createProcessor().onFailed(
                job(3, 3, { fileId: FILE_ID }, Date.now()),
                new Error('x'),
            );

            expect(failExecute).toHaveBeenCalledWith({
                fileId: FILE_ID,
                reason: 'provider-unavailable',
            });
        });

        it('leaves the transcript alone while BullMQ will retry the job', async () => {
            await createProcessor().onFailed(job(1, 3), new Error('x'));

            expect(failExecute).not.toHaveBeenCalled();
            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({ jobId: FILE_ID, attemptsMade: 1, attempts: 3 }),
                'Meeting transcription job failed',
            );
        });

        it('logs under err when failing the transcript fails', async () => {
            const failure = new Error('db is down');
            failExecute.mockRejectedValue(failure);

            await createProcessor().onFailed(
                job(3, 3, { fileId: FILE_ID }, Date.now()),
                new Error('x'),
            );

            expect(log.error).toHaveBeenCalledWith(
                { fileId: FILE_ID, jobId: FILE_ID, err: failure },
                'Failed to fail an unfinished meeting transcription',
            );
        });

        it('fails the transcript of a job that stalled for good', async () => {
            queue.failedJobs.set('job-1', FILE_ID);

            await createProcessor().onStalled('job-1');

            expect(failExecute).toHaveBeenCalledWith({
                fileId: FILE_ID,
                reason: 'provider-unavailable',
            });
        });

        it('ignores a stalled job that went back to the queue', async () => {
            await createProcessor().onStalled('job-1');

            expect(failExecute).not.toHaveBeenCalled();
        });
    });

    it('takes the worker concurrency from env', () => {
        const processor = createProcessor({ ...ENV, MEETING_TRANSCRIPTION_CONCURRENCY: 5 });
        const worker: Pick<Worker, 'concurrency'> = { concurrency: 1 };
        Object.defineProperty(processor, 'worker', { get: () => worker });

        processor.onApplicationBootstrap();

        expect(worker.concurrency).toBe(5);
    });
});
