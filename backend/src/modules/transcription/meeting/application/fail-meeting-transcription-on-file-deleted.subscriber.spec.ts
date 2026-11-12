import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    RecordingEventPublisher,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import {
    FileDeletedEvent,
    type FileDeletionCause,
} from '../../../files/domain/events/file-deleted.event';
import { FileUploadedEvent } from '../../../files/domain/events/file-uploaded.event';
import type { FileKind } from '../../../files/domain/file-kind';
import { recordingLogger } from '../../application/test-doubles';
import { MeetingTranscript } from '../domain/meeting-transcript';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { FailMeetingTranscriptionUseCase } from './fail-meeting-transcription.use-case';
import {
    FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER,
    FailMeetingTranscriptionOnFileDeleted,
} from './fail-meeting-transcription-on-file-deleted.subscriber';
import { UnexpectedFileEventError } from './start-meeting-transcription-on-file-uploaded.subscriber';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const metadata = { timestamp: 1_700_000_000_000, userId: 'owner-1' };

function deleted(kind: FileKind, cause: FileDeletionCause): FileDeletedEvent {
    return new FileDeletedEvent({
        aggregateId: FILE_ID,
        ownerId: 'owner-1',
        kind,
        cause,
        metadata,
    });
}

describe('FailMeetingTranscriptionOnFileDeleted', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let failExecute: MockInstance<FailMeetingTranscriptionUseCase['execute']>;
    let subscriber: FailMeetingTranscriptionOnFileDeleted;

    beforeEach(() => {
        const transactions = new InMemoryTransactionRunner();
        transcripts = new InMemoryMeetingTranscriptRepository();
        const failTranscription = new FailMeetingTranscriptionUseCase(
            transcripts,
            new ReleaseFileHoldUseCase(
                new InMemoryStoredFileRepository(),
                testRetentionPolicy(),
                new FakeClock(),
                transactions,
            ),
            transactions,
            new RecordingEventPublisher(transactions),
            recordingLogger().logger,
        );
        failExecute = vi.spyOn(failTranscription, 'execute').mockResolvedValue(undefined);
        subscriber = new FailMeetingTranscriptionOnFileDeleted(failTranscription);
    });

    it('has a stable name and runs outside the delivery transaction', () => {
        expect(subscriber.name).toBe(FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER);
        expect(subscriber.isTransactional).toBe(false);
    });

    it.each([
        ['retention', 'timeout'],
        ['owner', 'file-deleted'],
    ] as const)(
        'fails an unfinished transcript of a recording deleted by %s',
        async (cause, reason) => {
            await subscriber.handle(deleted('recording', cause));

            expect(failExecute).toHaveBeenCalledWith({ fileId: FILE_ID, reason });
        },
    );

    it('fails a pending transcript with file-deleted when the owner deletes the recording', async () => {
        failExecute.mockRestore();
        await transcripts.insertPendingIfAbsent(
            MeetingTranscript.createPending({
                fileId: FILE_ID,
                ownerId: 'owner-1',
                now: new Date(metadata.timestamp),
            }),
        );

        await subscriber.handle(deleted('recording', 'owner'));

        const transcript = await transcripts.findByFileId(FILE_ID);
        expect(transcript?.status).toBe('failed');
        expect(transcript?.failureReason).toBe('file-deleted');
    });

    it('ignores a deleted document', async () => {
        await subscriber.handle(deleted('document', 'retention'));

        expect(failExecute).not.toHaveBeenCalled();
    });

    it('rejects an unexpected event', async () => {
        const uploaded = new FileUploadedEvent({
            aggregateId: FILE_ID,
            ownerId: 'owner-1',
            kind: 'recording',
            mediaType: 'audio/mpeg',
            sizeBytes: 1,
            metadata,
        });

        await expect(subscriber.handle(uploaded)).rejects.toBeInstanceOf(UnexpectedFileEventError);
    });
});
