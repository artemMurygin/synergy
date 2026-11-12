import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { HoldFileUseCase } from '../../../files/application/hold-file.use-case';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import { FileGoneError } from '../../../files/domain/errors';
import { recordingLogger, type RecordingLogger } from '../../application/test-doubles';
import { MeetingTranscriptNotRetryableError } from '../domain/errors';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { FakeMeetingTranscriptionQueue } from '../testing/fake-meeting-transcription-queue';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { MeetingTranscriptNotFoundError } from './errors';
import { RetryMeetingTranscriptionUseCase } from './retry-meeting-transcription.use-case';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const OWNER_ID = 'owner-1';
const NOW = new Date('2026-11-12T09:00:00Z');

function failedTranscript(): MeetingTranscript {
    const transcript = MeetingTranscript.createPending({
        fileId: FILE_ID,
        ownerId: OWNER_ID,
        now: NOW,
    });
    transcript.start();
    transcript.fail('provider-unavailable', NOW);
    transcript.pullDomainEvents();
    return transcript;
}

describe('RetryMeetingTranscriptionUseCase', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let queue: FakeMeetingTranscriptionQueue;
    let transactions: InMemoryTransactionRunner;
    let holdFile: MockInstance<HoldFileUseCase['execute']>;
    let releaseHold: MockInstance<ReleaseFileHoldUseCase['execute']>;
    let log: RecordingLogger;
    let useCase: RetryMeetingTranscriptionUseCase;

    const stored = async (): Promise<MeetingTranscript> => {
        const transcript = await transcripts.findByFileId(FILE_ID);
        if (transcript === null) throw new Error('transcript is missing');
        return transcript;
    };

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        queue = new FakeMeetingTranscriptionQueue();
        transactions = new InMemoryTransactionRunner();
        const files = new InMemoryStoredFileRepository();
        const hold = new HoldFileUseCase(
            files,
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        const release = new ReleaseFileHoldUseCase(
            files,
            testRetentionPolicy(),
            new FakeClock(),
            transactions,
        );
        holdFile = vi.spyOn(hold, 'execute').mockResolvedValue(undefined);
        releaseHold = vi.spyOn(release, 'execute').mockResolvedValue(undefined);
        log = recordingLogger();
        useCase = new RetryMeetingTranscriptionUseCase(
            transcripts,
            hold,
            release,
            queue,
            transactions,
            log.logger,
        );
    });

    it('restores the hold and saves pending in one transaction', async () => {
        await transcripts.save(failedTranscript());
        const inTransaction: boolean[] = [];
        holdFile.mockImplementation(() => {
            inTransaction.push(transactions.isInTransaction());
            return Promise.resolve();
        });
        const save = vi.spyOn(transcripts, 'save').mockImplementation((transcript) => {
            inTransaction.push(transactions.isInTransaction());
            transcripts.items.set(transcript.fileId, transcript);
            return Promise.resolve();
        });

        await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        expect(save).toHaveBeenCalledTimes(1);
        expect(inTransaction).toEqual([true, true]);
        expect(transactions.commits).toBe(1);
    });

    it('rolls the transcript back to failed and releases the hold when enqueue fails', async () => {
        await transcripts.save(failedTranscript());
        const failure = new Error('redis is down');
        vi.spyOn(queue, 'enqueue').mockRejectedValue(failure);

        await expect(useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID })).rejects.toBe(failure);

        const transcript = await stored();
        expect(transcript.status).toBe('failed');
        expect(transcript.failureReason).toBe('provider-unavailable');
        expect(transcript.completedAt).toEqual(NOW);
        expect(releaseHold).toHaveBeenCalledWith(FILE_ID);
    });

    it('logs under err when the rollback after a failed enqueue fails too', async () => {
        await transcripts.save(failedTranscript());
        vi.spyOn(queue, 'enqueue').mockRejectedValue(new Error('redis is down'));
        const rollbackFailure = new Error('db is down');
        releaseHold.mockRejectedValue(rollbackFailure);

        await expect(useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID })).rejects.toThrow(
            'redis is down',
        );

        expect(log.error).toHaveBeenCalledWith(
            { fileId: FILE_ID, err: rollbackFailure },
            'Failed to roll back a meeting transcription retry',
        );
    });

    it('moves a failed transcript to pending, restores the hold and enqueues a new job', async () => {
        await transcripts.save(failedTranscript());
        queue.jobs.set(FILE_ID, { fileId: FILE_ID });

        await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        const transcript = await stored();
        expect(transcript.status).toBe('pending');
        expect(transcript.failureReason).toBeNull();
        expect(holdFile).toHaveBeenCalledWith(FILE_ID);
        const newJobs = [...queue.jobs.entries()].filter(([jobId]) => jobId !== FILE_ID);
        expect(newJobs).toHaveLength(1);
        expect(newJobs[0][1]).toEqual({ fileId: FILE_ID });
    });

    it('uses a BullMQ-compatible job id that differs between retries', async () => {
        await transcripts.save(failedTranscript());
        await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });
        const transcript = await stored();
        transcript.start();
        transcript.fail('provider-unavailable', NOW);
        await transcripts.save(transcript);

        await useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID });

        const jobIds = [...queue.jobs.keys()];
        expect(jobIds).toHaveLength(2);
        // BullMQ отвергает собственный jobId с одним двоеточием.
        for (const jobId of jobIds) expect(jobId).not.toContain(':');
    });

    it('rejects a transcript that is not failed with 409 and keeps everything as is', async () => {
        const transcript = MeetingTranscript.createPending({
            fileId: FILE_ID,
            ownerId: OWNER_ID,
            now: NOW,
        });
        transcript.start();
        await transcripts.save(transcript);

        await expect(
            useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(MeetingTranscriptNotRetryableError);

        expect((await stored()).status).toBe('processing');
        expect(holdFile).not.toHaveBeenCalled();
        expect(queue.jobs.size).toBe(0);
    });

    it('answers 410 when the recording is deleted and leaves the transcript failed', async () => {
        await transcripts.save(failedTranscript());
        holdFile.mockRejectedValue(new FileGoneError(FILE_ID));

        await expect(
            useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(FileGoneError);

        expect((await stored()).status).toBe('failed');
        expect(queue.jobs.size).toBe(0);
    });

    it('rejects a transcript of another owner with 404', async () => {
        await transcripts.save(failedTranscript());

        await expect(
            useCase.execute({ ownerId: 'owner-2', fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);

        expect(holdFile).not.toHaveBeenCalled();
    });

    it('rejects a missing transcript with 404', async () => {
        await expect(
            useCase.execute({ ownerId: OWNER_ID, fileId: FILE_ID }),
        ).rejects.toBeInstanceOf(MeetingTranscriptNotFoundError);
    });
});
