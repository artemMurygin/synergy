import { beforeEach, describe, expect, it } from 'vitest';
import { DomainEvent } from '../../../../shared/ddd';
import { FileUploadedEvent } from '../../../files/domain/events/file-uploaded.event';
import type { FileKind } from '../../../files/domain/file-kind';
import { FakeMeetingTranscriptionQueue } from '../testing/fake-meeting-transcription-queue';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import {
    START_MEETING_TRANSCRIPTION_SUBSCRIBER,
    StartMeetingTranscriptionOnFileUploaded,
    UnexpectedFileEventError,
} from './start-meeting-transcription-on-file-uploaded.subscriber';

const FILE_ID = '0b9f1c2e-7d4a-4f61-9c3b-2a5e8d7f6a10';
const UPLOADED_AT = Date.parse('2026-11-12T10:00:00Z');

function fileUploaded(kind: FileKind): FileUploadedEvent {
    return new FileUploadedEvent({
        aggregateId: FILE_ID,
        ownerId: 'owner-1',
        kind,
        mediaType: kind === 'recording' ? 'audio/wav' : 'application/pdf',
        sizeBytes: 1024,
        metadata: { timestamp: UPLOADED_AT },
    });
}

describe('StartMeetingTranscriptionOnFileUploaded', () => {
    let transcripts: InMemoryMeetingTranscriptRepository;
    let queue: FakeMeetingTranscriptionQueue;
    let subscriber: StartMeetingTranscriptionOnFileUploaded;

    beforeEach(() => {
        transcripts = new InMemoryMeetingTranscriptRepository();
        queue = new FakeMeetingTranscriptionQueue();
        subscriber = new StartMeetingTranscriptionOnFileUploaded(transcripts, queue);
    });

    // В транзакции job попадал в Redis раньше коммита строки, и воркер её не находил.
    it('is a non-transactional subscriber with a stable name, so the row commits before the job', () => {
        expect(subscriber.name).toBe(START_MEETING_TRANSCRIPTION_SUBSCRIBER);
        expect(subscriber.isTransactional).toBe(false);
    });

    it('creates a pending transcript and enqueues a job keyed by the file id for a recording', async () => {
        await subscriber.handle(fileUploaded('recording'));

        const transcript = await transcripts.findByFileId(FILE_ID);
        expect(transcript?.status).toBe('pending');
        expect(transcript?.ownerId).toBe('owner-1');
        expect(transcript?.attempts).toBe(0);
        expect(transcript?.createdAt).toEqual(new Date(UPLOADED_AT));
        expect([...queue.jobs.entries()]).toEqual([[FILE_ID, { fileId: FILE_ID }]]);
    });

    it('does nothing for a document', async () => {
        await subscriber.handle(fileUploaded('document'));

        expect(transcripts.items.size).toBe(0);
        expect(queue.jobs.size).toBe(0);
    });

    it('does not create a second transcript or job on redelivery', async () => {
        const event = fileUploaded('recording');

        await subscriber.handle(event);
        await subscriber.handle(event);

        expect(transcripts.items.size).toBe(1);
        expect(queue.jobs.size).toBe(1);
    });

    it('keeps an already processed transcript untouched on redelivery', async () => {
        await subscriber.handle(fileUploaded('recording'));
        const existing = await transcripts.findByFileId(FILE_ID);
        if (existing === null) throw new Error('transcript is missing');
        existing.start();
        await transcripts.save(existing);

        await subscriber.handle(fileUploaded('recording'));

        expect((await transcripts.findByFileId(FILE_ID))?.status).toBe('processing');
    });

    it('rejects an unexpected event type', async () => {
        class OtherEvent extends DomainEvent {
            constructor() {
                super({ aggregateId: FILE_ID });
            }
        }

        await expect(subscriber.handle(new OtherEvent())).rejects.toThrow(UnexpectedFileEventError);
        expect(queue.jobs.size).toBe(0);
    });
});
