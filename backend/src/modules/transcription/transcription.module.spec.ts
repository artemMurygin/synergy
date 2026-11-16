import { Global, HttpStatus, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { InMemoryTransactionRunner } from '../../database/postgres/testing/in-memory-transaction-runner';
import { TransactionRunnerPort } from '../../database/postgres/transaction-runner.port';
import { MEETINGS_AGENT_CAPABILITY } from '../../shared/agent-capability';
import { DomainEventPublisherPort } from '../../shared/ddd';
import { findErrorStatus } from '../../shared/http/error-status.registry';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { GetFileUseCase } from '../files/application/get-file.use-case';
import { HoldFileUseCase } from '../files/application/hold-file.use-case';
import { StoreGeneratedFileUseCase } from '../files/application/store-generated-file.use-case';
import { OpenFileForProcessingUseCase } from '../files/application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from '../files/application/release-file-hold.use-case';
import { FILE_DELETED_EVENT_TYPE } from '../files/domain/events/file-deleted.event';
import { FILE_UPLOADED_EVENT_TYPE } from '../files/domain/events/file-uploaded.event';
import { FilesModule } from '../files/files.module';
import { TranscribeVoiceUseCase } from './application/transcribe-voice.use-case';
import { TranscriberPort } from './domain/ports/transcriber.port';
import { Transcriber } from './infrastructure/openrouter/transcriber';
import { FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER } from './meeting/application/fail-meeting-transcription-on-file-deleted.subscriber';
import { FailMeetingTranscriptionUseCase } from './meeting/application/fail-meeting-transcription.use-case';
import { GetMeetingTranscriptUseCase } from './meeting/application/get-meeting-transcript.use-case';
import {
    ExtractMeetingTasksSettings,
    ExtractMeetingTasksUseCase,
} from './meeting/application/extract-meeting-tasks.use-case';
import { GetSpeakerSamplesUseCase } from './meeting/application/get-speaker-samples.use-case';
import { MeetingDocuments } from './meeting/application/meeting-documents';
import { TaskExtractorPort } from './meeting/domain/ports/task-extractor.port';
import { TaskExtractor } from './meeting/infrastructure/openrouter/task-extractor';
import { RetryMeetingTranscriptionUseCase } from './meeting/application/retry-meeting-transcription.use-case';
import { START_MEETING_TRANSCRIPTION_SUBSCRIBER } from './meeting/application/start-meeting-transcription-on-file-uploaded.subscriber';
import { MeetingAudioPreparerPort } from './meeting/domain/ports/meeting-audio-preparer.port';
import { WholeFileSttPort } from './meeting/domain/ports/whole-file-stt.port';
import { MeetingAudioPreparer } from './meeting/infrastructure/ffmpeg/meeting-audio-preparer';
import { WholeFileStt } from './meeting/infrastructure/openrouter/whole-file-stt';
import { TranscribeMeetingUseCase } from './meeting/application/transcribe-meeting.use-case';
import { MeetingTranscriberPort } from './meeting/domain/ports/meeting-transcriber.port';
import { MeetingFilesPort } from './meeting/domain/ports/meeting-files.port';
import { MeetingTranscriptRepositoryPort } from './meeting/domain/ports/meeting-transcript-repository.port';
import { MeetingTranscriptionQueuePort } from './meeting/domain/ports/meeting-transcription-queue.port';
import { WholeFileMeetingTranscriber } from './meeting/infrastructure/whole-file-meeting-transcriber';
import { ChunkedMeetingTranscriber } from './meeting/infrastructure/chunked-meeting-transcriber';
import { MeetingTranscriptionQueue } from './meeting/infrastructure/queue/meeting-transcription.queue';
import { MEETING_TRANSCRIPTION_QUEUE_NAME } from './meeting/infrastructure/queue/meeting-transcription-queue.constants';
import { MeetingTranscriptionQueueModule } from './meeting/infrastructure/queue/meeting-transcription-queue.module';
import { MeetingTranscriptionProcessor } from './meeting/infrastructure/queue/meeting-transcription.processor';
import { MeetingTranscriptRepository } from './meeting/infrastructure/persistence/meeting-transcript.repository';
import { MeetingsAgentCapability } from './meeting/interface/agent/meetings-agent.capability';
import { MeetingTranscriptsController } from './meeting/interface/http/meeting-transcripts.controller';
import { TranscriptionModule } from './transcription.module';

const values: Record<string, unknown> = {
    OPENROUTER_API_KEY: 'sk-or-test',
    OPENROUTER_BASE_URL: 'https://openrouter.test/api/v1',
    TRANSCRIPTION_MODEL: 'google/gemini-3.1-flash-lite',
    MEETING_TRANSCRIPTION_MODEL: 'elevenlabs/scribe-v2',
    MEETING_TRANSCRIPTION_STT_TIMEOUT_MS: 240_000,
    MEETING_TRANSCRIPTION_MAX_AUDIO_BYTES: 18_874_368,
    MEETING_TRANSCRIPTION_MAX_DURATION_SEC: 4500,
    MEETING_TRANSCRIPTION_CHUNK_SEC: 600,
    MEETING_TRANSCRIPTION_CHUNK_OVERLAP_SEC: 30,
    MEETING_TRANSCRIPTION_MAX_CHUNK_BYTES: 20971520,
    MEETING_TRANSCRIPTION_CHUNK_TIMEOUT_MS: 90000,
    MEETING_TRANSCRIPTION_MAX_EXEMPLARS: 8,
    MEETING_TRANSCRIPTION_EXEMPLAR_SEC: 10,
    MEETING_TRANSCRIPTION_ATTEMPTS: 3,
    MEETING_TRANSCRIPTION_CONCURRENCY: 2,
    MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS: 7_200_000,
    MEETING_TASKS_WINDOW_TOKENS: 60_000,
    MEETING_TASKS_WINDOW_MINUTES: 30,
};

// Новый реестр на каждое приложение: события нельзя зарегистрировать дважды.
let registry = new DomainEventRegistry();

@Global()
@Module({
    providers: [
        { provide: ConfigService, useValue: { get: (key: string) => values[key] } },
        {
            provide: DomainEventRegistry,
            useFactory: (): DomainEventRegistry => (registry = new DomainEventRegistry()),
        },
        { provide: DomainEventPublisherPort, useValue: { publish: vi.fn() } },
    ],
    exports: [ConfigService, DomainEventRegistry, DomainEventPublisherPort],
})
class FakeInfrastructureModule {}

// Публичные use case'ы files без S3 и БД.
@Module({
    providers: [
        { provide: OpenFileForProcessingUseCase, useValue: { execute: vi.fn() } },
        { provide: HoldFileUseCase, useValue: { execute: vi.fn() } },
        { provide: ReleaseFileHoldUseCase, useValue: { execute: vi.fn() } },
        { provide: StoreGeneratedFileUseCase, useValue: { execute: vi.fn() } },
        { provide: GetFileUseCase, useValue: { execute: vi.fn() } },
    ],
    exports: [
        OpenFileForProcessingUseCase,
        HoldFileUseCase,
        ReleaseFileHoldUseCase,
        StoreGeneratedFileUseCase,
        GetFileUseCase,
    ],
})
class FakeFilesModule {}

@Module({
    providers: [{ provide: TransactionRunnerPort, useValue: new InMemoryTransactionRunner() }],
    exports: [TransactionRunnerPort],
})
class FakePostgresModule {}

const queueToken = getQueueToken(MEETING_TRANSCRIPTION_QUEUE_NAME);

@Module({
    providers: [{ provide: queueToken, useValue: { add: vi.fn() } }],
    exports: [queueToken],
})
class FakeQueueModule {}

const importsOf = (): unknown[] =>
    Reflect.getMetadata(MODULE_METADATA.IMPORTS, TranscriptionModule) as unknown[];

describe('TranscriptionModule', () => {
    let app: INestApplication | undefined;

    async function createApp(): Promise<INestApplication> {
        const moduleRef = await Test.createTestingModule({
            imports: [
                FakeInfrastructureModule,
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                TranscriptionModule,
            ],
        })
            .overrideModule(FilesModule)
            .useModule(FakeFilesModule)
            .overrideModule(PostgresModule)
            .useModule(FakePostgresModule)
            .overrideModule(MeetingTranscriptionQueueModule)
            .useModule(FakeQueueModule)
            // Без Redis воркер не создаётся.
            .overrideProvider(MeetingTranscriptionProcessor)
            .useValue({})
            .compile();
        const nestApp = moduleRef.createNestApplication({ logger: false });
        await nestApp.init();
        return nestApp;
    }

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it('builds the voice use case on top of the OpenRouter adapter', async () => {
        app = await createApp();

        expect(app.get(TranscribeVoiceUseCase)).toBeInstanceOf(TranscribeVoiceUseCase);
        expect(app.get(TranscriberPort)).toBeInstanceOf(Transcriber);
    });

    it('exports the voice use case, the meetings capability and what the chat notifier needs', () => {
        const exported: unknown = Reflect.getMetadata(MODULE_METADATA.EXPORTS, TranscriptionModule);

        expect(exported).toEqual([
            TranscribeVoiceUseCase,
            MEETINGS_AGENT_CAPABILITY,
            MeetingDocuments,
            MeetingFilesPort,
            MeetingTranscriptRepositoryPort,
        ]);
    });

    it('imports FilesModule, the database and the meeting-transcription queue', () => {
        expect(importsOf()).toEqual(
            expect.arrayContaining([FilesModule, PostgresModule, MeetingTranscriptionQueueModule]),
        );
    });

    it('serves the transcripts controller', () => {
        const controllers: unknown = Reflect.getMetadata(
            MODULE_METADATA.CONTROLLERS,
            TranscriptionModule,
        );

        expect(controllers).toEqual([MeetingTranscriptsController]);
    });

    it('wires the meeting transcription use cases and adapters', async () => {
        app = await createApp();

        expect(app.get(TranscribeMeetingUseCase)).toBeInstanceOf(TranscribeMeetingUseCase);
        expect(app.get(GetMeetingTranscriptUseCase)).toBeInstanceOf(GetMeetingTranscriptUseCase);
        expect(app.get(RetryMeetingTranscriptionUseCase)).toBeInstanceOf(
            RetryMeetingTranscriptionUseCase,
        );
        expect(app.get(FailMeetingTranscriptionUseCase)).toBeInstanceOf(
            FailMeetingTranscriptionUseCase,
        );
        expect(app.get(MeetingTranscriberPort)).toBeInstanceOf(WholeFileMeetingTranscriber);
        expect(app.get(MeetingTranscriberPort)).not.toBeInstanceOf(ChunkedMeetingTranscriber);
        expect(app.get(MeetingTranscriptRepositoryPort)).toBeInstanceOf(
            MeetingTranscriptRepository,
        );
        expect(app.get(MeetingTranscriptionQueuePort)).toBeInstanceOf(MeetingTranscriptionQueue);
    });

    it('builds the whole-file adapters from the OpenRouter key and limits', async () => {
        app = await createApp();

        expect(app.get(WholeFileSttPort)).toBeInstanceOf(WholeFileStt);
        expect(app.get(MeetingAudioPreparerPort)).toBeInstanceOf(MeetingAudioPreparer);
        expect(app.get(WholeFileSttPort)).toMatchObject({
            settings: {
                apiKey: 'sk-or-test',
                baseUrl: 'https://openrouter.test/api/v1',
                model: 'elevenlabs/scribe-v2',
                timeoutMs: 240_000,
                maxAudioBytes: 18_874_368,
            },
        });
    });

    it('provides the meetings agent capability for the assistant', async () => {
        app = await createApp();

        expect(app.get(MEETINGS_AGENT_CAPABILITY)).toBeInstanceOf(MeetingsAgentCapability);
    });

    it('wires the meeting documents, speaker samples and task extraction', async () => {
        app = await createApp();

        expect(app.get(MeetingDocuments)).toBeInstanceOf(MeetingDocuments);
        expect(app.get(GetSpeakerSamplesUseCase)).toBeInstanceOf(GetSpeakerSamplesUseCase);
        expect(app.get(ExtractMeetingTasksUseCase)).toBeInstanceOf(ExtractMeetingTasksUseCase);
        expect(app.get(TaskExtractorPort)).toBeInstanceOf(TaskExtractor);
        expect(app.get(ExtractMeetingTasksSettings)).toEqual({
            windowTokens: 60_000,
            windowSec: 1800,
            overlapSec: 120,
        });
    });

    it('subscribes to file.uploaded and file.deleted and registers error statuses on start', async () => {
        app = await createApp();

        expect(
            registry.findSubscriber(
                FILE_UPLOADED_EVENT_TYPE,
                START_MEETING_TRANSCRIPTION_SUBSCRIBER,
            ),
        ).toBeDefined();
        expect(
            registry.findSubscriber(
                FILE_DELETED_EVENT_TYPE,
                FAIL_MEETING_TRANSCRIPTION_ON_FILE_DELETED_SUBSCRIBER,
            ),
        ).toBeDefined();
        expect(findErrorStatus('MEETING_TRANSCRIPT_NOT_FOUND')).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus('MEETING_TRANSCRIPTION_NOT_RETRYABLE')).toBe(HttpStatus.CONFLICT);
    });
});
