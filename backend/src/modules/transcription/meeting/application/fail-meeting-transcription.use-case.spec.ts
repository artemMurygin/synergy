import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    RecordingEventPublisher,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import { recordingLogger, type RecordingLogger } from '../../application/test-doubles';
import { DiarizedTranscript } from '../domain/diarized-transcript';
import { MeetingTranscriptCompletedEvent } from '../domain/events/meeting-transcript-completed.event';
import { MeetingTranscriptFailedEvent } from '../domain/events/meeting-transcript-failed.event';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { FailMeetingTranscriptionUseCase } from './fail-meeting-transcription.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const NOW = new Date('2026-11-12T09:00:00Z');

describe('FailMeetingTranscriptionUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let transactions: InMemoryTransactionRunner;
    let events: RecordingEventPublisher;
    let releaseHold: ReleaseFileHoldUseCase;
    let releaseExecute: MockInstance<ReleaseFileHoldUseCase['execute']>;
    let log: RecordingLogger;
    let useCase: FailMeetingTranscriptionUseCase;

    const stored = async (): Promise<MeetingTranscript> => {
        const transcript = await transcripts.findByFileId(FILE_ID);
        if (transcript === null) throw new Error('transcript is missing');
        return transcript;
    };

    beforeEach(async () => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        transactions = new InMemoryTransactionRunner();
        transcripts.transactions = transactions;
        events = new RecordingEventPublisher(transactions);
        releaseHold = new ReleaseFileHoldUseCase(
            new InMemoryStoredFileRepository(),
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        releaseExecute = vi.spyOn(releaseHold, 'execute').mockResolvedValue(undefined);
        log = recordingLogger();
        useCase = new FailMeetingTranscriptionUseCase(
            transcripts,
            releaseHold,
            transactions,
            events,
            log.logger,
        );
        await transcripts.insertPendingIfAbsent(
            MeetingTranscript.createPending({ fileId: FILE_ID, ownerId: 'owner-1', now: NOW }),
        );
    });

    it.each(['pending', 'processing'] as const)(
        'fails a %s transcript, publishes the event in a transaction and releases the hold',
        async (status) => {
            if (status === 'processing') {
                const transcript = await stored();
                transcript.start();
                await transcripts.save(transcript);
            }

            await useCase.execute({ fileId: FILE_ID, reason: 'timeout' });

            const transcript = await stored();
            expect(transcript.status).toBe('failed');
            expect(transcript.failureReason).toBe('timeout');
            expect(events.published).toHaveLength(1);
            expect(events.published[0]).toBeInstanceOf(MeetingTranscriptFailedEvent);
            expect(events.publishedInTransaction).toEqual([true]);
            expect(releaseExecute).toHaveBeenCalledWith(FILE_ID);
            expect(log.warn).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: FILE_ID, reason: 'timeout', outcome: 'failed' }),
                'Unfinished meeting transcription failed',
            );
        },
    );

    it('leaves a final transcript as is', async () => {
        const transcript = await stored();
        transcript.start();
        transcript.fail('too-long', NOW);
        transcript.pullDomainEvents();
        await transcripts.save(transcript);

        await useCase.execute({ fileId: FILE_ID, reason: 'provider-unavailable' });

        expect((await stored()).failureReason).toBe('too-long');
        expect(events.published).toEqual([]);
        expect(releaseExecute).not.toHaveBeenCalled();
    });

    it('reads the transcript under a row lock inside the transaction', async () => {
        await useCase.execute({ fileId: FILE_ID, reason: 'timeout' });

        expect(transcripts.lockedInTransaction).toEqual([true]);
    });

    it('keeps a transcript the job finished concurrently and publishes nothing', async () => {
        const running = await stored();
        running.start();
        await transcripts.save(running);
        transcripts.interleaveOnNextRead(async () => {
            const finishing = await stored();
            finishing.complete(
                DiarizedTranscript.of({ language: 'ru', durationSec: 10, segments: [] }),
                NOW,
            );
            await transcripts.save(finishing);
            await events.publish(finishing.pullDomainEvents());
        });

        await useCase.execute({ fileId: FILE_ID, reason: 'timeout' });

        expect((await stored()).status).toBe('no_speech');
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toBeInstanceOf(MeetingTranscriptCompletedEvent);
        expect(releaseExecute).not.toHaveBeenCalled();
    });

    it('does nothing without a transcript', async () => {
        transcripts.items.clear();

        await expect(
            useCase.execute({ fileId: FILE_ID, reason: 'timeout' }),
        ).resolves.toBeUndefined();
        expect(events.published).toEqual([]);
    });

    it('keeps the failure when releasing the hold fails and logs it under err', async () => {
        const failure = new Error('db is down');
        releaseExecute.mockRejectedValue(failure);

        await useCase.execute({ fileId: FILE_ID, reason: 'timeout' });

        expect((await stored()).status).toBe('failed');
        expect(log.error).toHaveBeenCalledWith(
            { fileId: FILE_ID, err: failure },
            'Failed to release the recording hold',
        );
    });
});
