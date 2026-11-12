import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { InMemoryTransactionRunner } from '../../../../database/postgres/testing/in-memory-transaction-runner';
import type { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../../shared/ddd';
import { OpenFileForProcessingUseCase } from '../../../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryObjectStorage,
    InMemoryStoredFileRepository,
    silentLogger,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import { recordingLogger, type RecordingLogger } from '../../application/test-doubles';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import { TranscriptionPermanentError, TranscriptionTemporaryError } from '../domain/errors';
import { MeetingTranscriptCompletedEvent } from '../domain/events/meeting-transcript-completed.event';
import { MeetingTranscriptFailedEvent } from '../domain/events/meeting-transcript-failed.event';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { TranscriptSegment } from '../domain/transcript-segment';
import { FakeMeetingTranscriber } from '../testing/fake-meeting-transcriber';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { InMemoryTranscriptSegmentRepository } from '../testing/in-memory-transcript-segment.repository';
import { FailMeetingTranscriptionUseCase } from './fail-meeting-transcription.use-case';
import { TranscribeMeetingUseCase } from './transcribe-meeting.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const NOW = new Date('2026-11-12T10:00:00Z');
const SECRET_PHRASE = 'секретная фраза про бюджет';

class RecordingPublisher extends DomainEventPublisherPort {
    readonly published: DomainEvent[] = [];

    readonly inTransaction: boolean[] = [];

    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    publish(events: readonly DomainEvent[]): Promise<void> {
        this.inTransaction.push(this.transactions.isInTransaction());
        this.published.push(...events);
        return Promise.resolve();
    }
}

const dialog = (): DiarizedTranscript =>
    DiarizedTranscript.of({
        language: 'ru',
        durationSec: 125,
        segments: [
            TranscriptSegment.of({
                seq: 0,
                speaker: 1,
                startSec: 0,
                endSec: 4,
                text: SECRET_PHRASE,
            }),
            TranscriptSegment.of({ seq: 1, speaker: 2, startSec: 4, endSec: 9, text: 'Согласен' }),
        ],
    });

const silence = (): DiarizedTranscript =>
    DiarizedTranscript.of({ language: null, durationSec: 30, segments: [] });

describe('TranscribeMeetingUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let segments: InMemoryTranscriptSegmentRepository;
    let transactions: InMemoryTransactionRunner;
    let events: RecordingPublisher;
    let openFileUseCase: OpenFileForProcessingUseCase;
    let releaseHoldUseCase: ReleaseFileHoldUseCase;
    let openFile: MockInstance<OpenFileForProcessingUseCase['execute']>;
    let releaseHold: MockInstance<ReleaseFileHoldUseCase['execute']>;
    let log: RecordingLogger;

    const useCase = (transcriber: FakeMeetingTranscriber): TranscribeMeetingUseCase =>
        new TranscribeMeetingUseCase(
            transcripts,
            segments,
            transcriber,
            openFileUseCase,
            releaseHoldUseCase,
            transactions,
            events,
            log.logger,
        );

    const stored = async (): Promise<MeetingTranscript> => {
        const transcript = await transcripts.findByFileId(FILE_ID);
        if (transcript === null) throw new Error('transcript is missing');
        return transcript;
    };

    beforeEach(async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        transcripts = new InMemoryMeetingTranscriptRepository();
        transactions = new InMemoryTransactionRunner();
        transcripts.transactions = transactions;
        segments = new InMemoryTranscriptSegmentRepository(transactions);
        events = new RecordingPublisher(transactions);
        const files = new InMemoryStoredFileRepository();
        openFileUseCase = new OpenFileForProcessingUseCase(
            files,
            new InMemoryObjectStorage(),
            silentLogger(),
        );
        releaseHoldUseCase = new ReleaseFileHoldUseCase(
            files,
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        openFile = vi.spyOn(openFileUseCase, 'execute').mockImplementation(() =>
            Promise.resolve({
                stream: Readable.from([Buffer.from('audio')]),
                contentType: 'audio/ogg',
                sizeBytes: 4096,
            }),
        );
        releaseHold = vi.spyOn(releaseHoldUseCase, 'execute').mockResolvedValue(undefined);
        log = recordingLogger();
        await transcripts.insertPendingIfAbsent(
            MeetingTranscript.createPending({
                fileId: FILE_ID,
                ownerId: OWNER_ID,
                now: new Date('2026-11-12T09:00:00Z'),
            }),
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('success', () => {
        it('saves segments as completed, publishes the event in a transaction and releases the hold', async () => {
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            const transcript = await stored();
            expect(transcript.status).toBe('completed');
            expect(transcript.attempts).toBe(1);
            expect(transcript.speakerCount).toBe(2);
            expect((await segments.readAll(FILE_ID)).map((s) => s.text)).toEqual([
                SECRET_PHRASE,
                'Согласен',
            ]);
            expect(transcript.language).toBe('ru');
            expect(transcript.durationSec).toBe(125);
            expect(transcript.completedAt).toEqual(NOW);
            expect(events.published).toHaveLength(1);
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptCompletedEvent);
            expect(events.published[0]).toMatchObject({ status: 'completed' });
            expect(events.inTransaction).toEqual([true]);
            expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
        });

        it('writes segments in the same transaction as complete', async () => {
            await useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });

            expect(segments.inserts).toEqual([{ fileId: FILE_ID, count: 2, inTransaction: true }]);
            expect(transactions.commits).toBe(2);
            expect(await segments.readAll(FILE_ID)).toEqual(dialog().segments);
        });

        it('passes the file stream and its metadata to the transcriber', async () => {
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            expect(openFile).toHaveBeenCalledWith(FILE_ID);
            expect(transcriber.calls).toHaveLength(1);
            expect(transcriber.calls[0].audio.contentType).toBe('audio/ogg');
            expect(transcriber.calls[0].audio.sizeBytes).toBe(4096);
            expect(transcriber.calls[0].signal).toBeInstanceOf(AbortSignal);
        });

        it('marks an empty result as no_speech', async () => {
            await useCase(FakeMeetingTranscriber.answering(silence())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });

            const transcript = await stored();
            expect(transcript.status).toBe('no_speech');
            expect(await segments.readAll(FILE_ID)).toEqual([]);
            expect(segments.inserts).toEqual([]);
            expect(events.published[0]).toMatchObject({ status: 'no_speech' });
            expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
        });

        it('keeps the transcript when releasing the hold fails and logs it under err', async () => {
            const failure = new Error('db is down');
            releaseHold.mockRejectedValue(failure);

            await expect(
                useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                    fileId: FILE_ID,
                    isFinalAttempt: false,
                }),
            ).resolves.toBeUndefined();

            expect((await stored()).status).toBe('completed');
            expect(log.error).toHaveBeenCalledWith(
                { fileId: FILE_ID, err: failure },
                'Failed to release the recording hold',
            );
        });

        it('passes the job deadline to the transcriber', async () => {
            const deadline = new AbortController().signal;
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            await useCase(transcriber).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
                deadline,
            });

            expect(transcriber.calls[0]?.signal).toBe(deadline);
        });
    });

    describe('temporary error', () => {
        it('is rethrown on a non-final attempt without failing the transcript', async () => {
            const error = new TranscriptionTemporaryError('provider returned 503');

            await expect(
                useCase(FakeMeetingTranscriber.failing(error)).execute({
                    fileId: FILE_ID,
                    isFinalAttempt: false,
                }),
            ).rejects.toBe(error);

            const transcript = await stored();
            expect(transcript.status).toBe('processing');
            expect(transcript.attempts).toBe(1);
            expect(events.published).toEqual([]);
            expect(releaseHold).not.toHaveBeenCalled();
        });

        it('lets the next attempt succeed after a failed one', async () => {
            const error = new TranscriptionTemporaryError('provider returned 503');
            await expect(
                useCase(FakeMeetingTranscriber.failing(error)).execute({
                    fileId: FILE_ID,
                    isFinalAttempt: false,
                }),
            ).rejects.toBe(error);

            await useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });

            const transcript = await stored();
            expect(transcript.status).toBe('completed');
            expect(transcript.attempts).toBe(2);
        });

        it('fails the transcript with provider-unavailable on the final attempt', async () => {
            const error = new TranscriptionTemporaryError('provider returned 503');

            await expect(
                useCase(FakeMeetingTranscriber.failing(error)).execute({
                    fileId: FILE_ID,
                    isFinalAttempt: true,
                }),
            ).rejects.toBe(error);

            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.failureReason).toBe('provider-unavailable');
            expect(events.published).toHaveLength(1);
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
            expect(events.published[0]).toMatchObject({ reason: 'provider-unavailable' });
            expect(events.inTransaction).toEqual([true]);
            expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
        });

        it('treats an unexpected error as temporary', async () => {
            const error = new Error('socket hang up');

            await expect(
                useCase(FakeMeetingTranscriber.failing(error)).execute({
                    fileId: FILE_ID,
                    isFinalAttempt: true,
                }),
            ).rejects.toBe(error);

            expect((await stored()).failureReason).toBe('provider-unavailable');
        });
    });

    describe('job deadline', () => {
        it('fails with timeout at once, even on a non-final attempt, with a permanent error', async () => {
            const controller = new AbortController();
            const transcriber = new FakeMeetingTranscriber((_audio, signal) => {
                controller.abort(new DOMException('The operation timed out', 'TimeoutError'));
                return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error());
            });

            const failure = await useCase(transcriber)
                .execute({ fileId: FILE_ID, isFinalAttempt: false, deadline: controller.signal })
                .then(
                    () => null,
                    (error: unknown) => error,
                );

            expect(failure).toBeInstanceOf(TranscriptionPermanentError);
            if (!(failure instanceof TranscriptionPermanentError)) return;
            expect(failure.reason).toBe('timeout');
            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.failureReason).toBe('timeout');
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
            expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
        });
    });

    describe('permanent error', () => {
        it.each(['too-long', 'unsupported-media'] as const)(
            'fails the transcript with %s at once and rethrows',
            async (reason) => {
                const error = new TranscriptionPermanentError(reason);

                await expect(
                    useCase(FakeMeetingTranscriber.failing(error)).execute({
                        fileId: FILE_ID,
                        isFinalAttempt: false,
                    }),
                ).rejects.toBe(error);

                const transcript = await stored();
                expect(transcript.status).toBe('failed');
                expect(transcript.failureReason).toBe(reason);
                expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
                expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
            },
        );

        it('fails with file-deleted when the recording is gone, without calling the provider', async () => {
            openFile.mockResolvedValue(null);
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            const failure = await useCase(transcriber)
                .execute({ fileId: FILE_ID, isFinalAttempt: false })
                .then(
                    () => null,
                    (error: unknown) => error,
                );

            expect(failure).toBeInstanceOf(TranscriptionPermanentError);
            expect(failure).toMatchObject({ reason: 'file-deleted' });
            expect(transcriber.calls).toEqual([]);
            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.failureReason).toBe('file-deleted');
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
        });
    });

    describe('job for a missing or finished transcript', () => {
        it('does nothing when there is no transcript', async () => {
            transcripts.items.clear();
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            expect(openFile).not.toHaveBeenCalled();
            expect(transcriber.calls).toEqual([]);
        });

        it('does nothing when the transcript is already final', async () => {
            await useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });
            openFile.mockClear();
            const transcriber = FakeMeetingTranscriber.answering(silence());

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            expect(transcriber.calls).toEqual([]);
            expect(openFile).not.toHaveBeenCalled();
            expect((await stored()).status).toBe('completed');
        });
    });

    describe('transcript failed while the job is running', () => {
        // Подписчик `file.deleted` закрывает расшифровку, пока job ещё работает.
        const failConcurrently = (): Promise<void> =>
            new FailMeetingTranscriptionUseCase(
                transcripts,
                releaseHoldUseCase,
                transactions,
                events,
                log.logger,
            ).execute({ fileId: FILE_ID, reason: 'timeout' });

        it('does not overwrite the failure with the result', async () => {
            const transcriber = new FakeMeetingTranscriber(async () => {
                await failConcurrently();
                return dialog();
            });

            await expect(
                useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false }),
            ).resolves.toBeUndefined();

            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.failureReason).toBe('timeout');
            expect(await segments.readAll(FILE_ID)).toEqual([]);
            expect(events.published).toHaveLength(1);
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
        });

        it('writes no segments when the recording was deleted while the job ran', async () => {
            const transcriber = new FakeMeetingTranscriber(async () => {
                await new FailMeetingTranscriptionUseCase(
                    transcripts,
                    releaseHoldUseCase,
                    transactions,
                    events,
                    log.logger,
                ).execute({ fileId: FILE_ID, reason: 'file-deleted' });
                return dialog();
            });

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            const transcript = await stored();
            expect(transcript.failureReason).toBe('file-deleted');
            expect(segments.inserts).toEqual([]);
            expect(await segments.readAll(FILE_ID)).toEqual([]);
        });

        it('does not fail it a second time', async () => {
            const transcriber = new FakeMeetingTranscriber(async () => {
                await failConcurrently();
                throw new TranscriptionPermanentError('unsupported-media');
            });

            await expect(
                useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false }),
            ).resolves.toBeUndefined();

            expect((await stored()).failureReason).toBe('timeout');
            expect(events.published).toHaveLength(1);
            expect(events.published[0]).toMatchObject({ reason: 'timeout' });
        });

        it('does not start a transcript failed right after it was read', async () => {
            transcripts.interleaveOnNextRead(failConcurrently);
            const transcriber = FakeMeetingTranscriber.answering(dialog());

            await useCase(transcriber).execute({ fileId: FILE_ID, isFinalAttempt: false });

            expect(transcriber.calls).toEqual([]);
            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.attempts).toBe(0);
            expect(events.published).toHaveLength(1);
        });

        it('takes row locks inside transactions', async () => {
            await useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });

            expect(transcripts.lockedInTransaction).toEqual([true, true]);
        });
    });

    describe('logging', () => {
        it('logs the file id, size, duration, speakers, attempts and outcome but no text', async () => {
            await useCase(FakeMeetingTranscriber.answering(dialog())).execute({
                fileId: FILE_ID,
                isFinalAttempt: false,
            });

            expect(log.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileId: FILE_ID,
                    sizeBytes: 4096,
                    durationSec: 125,
                    speakerCount: 2,
                    attempts: 1,
                    outcome: 'completed',
                    elapsedMs: expect.any(Number) as number,
                }),
                expect.any(String),
            );
            const dump = log.dump();
            expect(dump).not.toContain(SECRET_PHRASE);
            expect(dump).not.toContain('Согласен');
            expect(dump).not.toMatch(/fileName|originalName/);
        });

        it('logs the total seconds and cost billed by the provider', async () => {
            await useCase(
                FakeMeetingTranscriber.answering(dialog(), { seconds: 930, cost: 0.06 }),
            ).execute({ fileId: FILE_ID, isFinalAttempt: false });

            expect(log.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileId: FILE_ID,
                    outcome: 'completed',
                    usage: { seconds: 930, cost: 0.06 },
                }),
                'Meeting transcribed',
            );
        });

        it('logs the failure outcome and reason without the error text of the provider', async () => {
            await expect(
                useCase(
                    FakeMeetingTranscriber.failing(new TranscriptionPermanentError('too-long')),
                ).execute({ fileId: FILE_ID, isFinalAttempt: false }),
            ).rejects.toBeInstanceOf(TranscriptionPermanentError);

            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    fileId: FILE_ID,
                    attempts: 1,
                    outcome: 'failed',
                    reason: 'too-long',
                }),
                expect.any(String),
            );
        });

        it('logs a retry outcome for a temporary error on a non-final attempt', async () => {
            await expect(
                useCase(
                    FakeMeetingTranscriber.failing(new TranscriptionTemporaryError('503')),
                ).execute({ fileId: FILE_ID, isFinalAttempt: false }),
            ).rejects.toBeInstanceOf(TranscriptionTemporaryError);

            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: FILE_ID, attempts: 1, outcome: 'retry' }),
                expect.any(String),
            );
        });
    });
});
