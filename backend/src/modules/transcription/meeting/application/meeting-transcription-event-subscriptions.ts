import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DomainEventRegistry } from '../../../../shared/outbox/application/domain-event-registry';
import { FILE_DELETED_EVENT_TYPE } from '../../../files/domain/events/file-deleted.event';
import { FILE_UPLOADED_EVENT_TYPE } from '../../../files/domain/events/file-uploaded.event';
import { registerMeetingTranscriptEvents } from '../contracts/register-meeting-transcript-events';
import { FailMeetingTranscriptionOnFileDeleted } from './fail-meeting-transcription-on-file-deleted.subscriber';
import { StartMeetingTranscriptionOnFileUploaded } from './start-meeting-transcription-on-file-uploaded.subscriber';

@Injectable()
export class MeetingTranscriptionEventSubscriptions implements OnModuleInit {
    constructor(
        private readonly registry: DomainEventRegistry,
        private readonly startOnFileUploaded: StartMeetingTranscriptionOnFileUploaded,
        private readonly failOnFileDeleted: FailMeetingTranscriptionOnFileDeleted,
    ) {}

    onModuleInit(): void {
        registerMeetingTranscriptEvents(this.registry);
        this.registry.subscribe(FILE_UPLOADED_EVENT_TYPE, this.startOnFileUploaded);
        this.registry.subscribe(FILE_DELETED_EVENT_TYPE, this.failOnFileDeleted);
    }
}
