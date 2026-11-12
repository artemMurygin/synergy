import { describe, expect, it } from 'vitest';
import { ReleaseFileHoldUseCase } from '../../../files/application/release-file-hold.use-case';
import {
    FakeClock,
    InMemoryStoredFileRepository,
    InMemoryTransactionRunner,
    RecordingEventPublisher,
    testRetentionPolicy,
} from '../../../files/application/test-doubles';
import { FILE_DELETED_EVENT_TYPE } from '../../../files/domain/events/file-deleted.event';
import {
    DomainEventRegistry,
    DuplicateEventTypeError,
} from '../../../../shared/outbox/application/domain-event-registry';
import { registerFileEvents } from '../../../files/contracts/register-file-events';
import { FILE_UPLOADED_EVENT_TYPE } from '../../../files/domain/events/file-uploaded.event';
import { recordingLogger } from '../../application/test-doubles';
import { registerMeetingTranscriptEvents } from '../contracts/register-meeting-transcript-events';
import { FakeMeetingTranscriptionQueue } from '../testing/fake-meeting-transcription-queue';
import { InMemoryMeetingTranscriptRepository } from '../testing/in-memory-meeting-transcript.repository';
import { FailMeetingTranscriptionUseCase } from './fail-meeting-transcription.use-case';
import {
    FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER,
    FailMeetingTranscriptionOnFileDeleted,
} from './fail-meeting-transcription-on-file-deleted.subscriber';
import { MeetingTranscriptionEventSubscriptions } from './meeting-transcription-event-subscriptions';
import {
    START_MEETING_TRANSCRIPTION_SUBSCRIBER,
    StartMeetingTranscriptionOnFileUploaded,
} from './start-meeting-transcription-on-file-uploaded.subscriber';

describe('MeetingTranscriptionEventSubscriptions', () => {
    it('subscribes to file.uploaded and file.deleted and registers transcript events', () => {
        const registry = new DomainEventRegistry();
        registerFileEvents(registry);
        const transcripts = new InMemoryMeetingTranscriptRepository();
        const subscriber = new StartMeetingTranscriptionOnFileUploaded(
            transcripts,
            new FakeMeetingTranscriptionQueue(),
        );
        const transactions = new InMemoryTransactionRunner();
        const onDeleted = new FailMeetingTranscriptionOnFileDeleted(
            new FailMeetingTranscriptionUseCase(
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
            ),
        );

        new MeetingTranscriptionEventSubscriptions(registry, subscriber, onDeleted).onModuleInit();

        expect(
            registry.findSubscriber(
                FILE_UPLOADED_EVENT_TYPE,
                START_MEETING_TRANSCRIPTION_SUBSCRIBER,
            ),
        ).toBe(subscriber);
        expect(
            registry.findSubscriber(
                FILE_DELETED_EVENT_TYPE,
                FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER,
            ),
        ).toBe(onDeleted);
        // Повторная регистрация тех же типов падает, значит события уже зарегистрированы.
        expect(() => {
            registerMeetingTranscriptEvents(registry);
        }).toThrow(DuplicateEventTypeError);
    });
});
