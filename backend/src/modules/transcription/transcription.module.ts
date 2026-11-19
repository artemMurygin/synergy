import {
    Inject,
    Injectable,
    Logger,
    Module,
    type OnApplicationShutdown,
    type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { MEETINGS_AGENT_CAPABILITY } from '../../shared/agent-capability';
import { DocumentsModule } from '../../shared/documents';
import { createChatModel } from '../../shared/llm';
import { FilesModule } from '../files/files.module';
import { TranscribeUploadedVoiceUseCase } from './application/transcribe-uploaded-voice.use-case';
import { TranscribeVoiceUseCase } from './application/transcribe-voice.use-case';
import { TranscriberPort } from './domain/ports/transcriber.port';
import { VoiceAudioNormalizerPort } from './domain/ports/voice-audio-normalizer.port';
import { VoiceRateLimiterPort } from './domain/ports/voice-rate-limiter.port';
import {
    DEFAULT_VOICE_NORMALIZE_TIMEOUT_MS,
    FfmpegVoiceAudioNormalizer,
} from './infrastructure/ffmpeg/ffmpeg-voice-audio-normalizer';
import { Transcriber } from './infrastructure/openrouter/transcriber';
import { RedisVoiceRateLimiter } from './infrastructure/redis/redis-voice-rate-limiter';
import { VoiceTranscriptionsController } from './interface/http/voice-transcriptions.controller';
import { FailMeetingTranscriptionOnFileDeleted } from './meeting/application/fail-meeting-transcription-on-file-deleted.subscriber';
import { FailMeetingTranscriptionUseCase } from './meeting/application/fail-meeting-transcription.use-case';
import {
    ExtractMeetingTasksSettings,
    ExtractMeetingTasksUseCase,
} from './meeting/application/extract-meeting-tasks.use-case';
import { GetSpeakerSamplesUseCase } from './meeting/application/get-speaker-samples.use-case';
import { MeetingDocuments } from './meeting/application/meeting-documents';
import { GetMeetingTranscriptUseCase } from './meeting/application/get-meeting-transcript.use-case';
import { MeetingTranscriptionEventSubscriptions } from './meeting/application/meeting-transcription-event-subscriptions';
import { RenameSpeakersUseCase } from './meeting/application/rename-speakers.use-case';
import { RetryMeetingTranscriptionUseCase } from './meeting/application/retry-meeting-transcription.use-case';
import { StartMeetingTranscriptionOnFileUploaded } from './meeting/application/start-meeting-transcription-on-file-uploaded.subscriber';
import { TranscribeMeetingUseCase } from './meeting/application/transcribe-meeting.use-case';
import { MeetingAudioPreparerPort } from './meeting/domain/ports/meeting-audio-preparer.port';
import { WholeFileSttPort } from './meeting/domain/ports/whole-file-stt.port';
import { MeetingFilesPort } from './meeting/domain/ports/meeting-files.port';
import { MeetingTranscriberPort } from './meeting/domain/ports/meeting-transcriber.port';
import { MeetingTranscriptRepositoryPort } from './meeting/domain/ports/meeting-transcript-repository.port';
import { MeetingTranscriptionQueuePort } from './meeting/domain/ports/meeting-transcription-queue.port';
import { TaskExtractorPort } from './meeting/domain/ports/task-extractor.port';
import { TranscriptSegmentRepositoryPort } from './meeting/domain/ports/transcript-segment-repository.port';
import { WholeFileStt } from './meeting/infrastructure/openrouter/whole-file-stt';
import { MeetingAudioPreparer } from './meeting/infrastructure/ffmpeg/meeting-audio-preparer';
import { WholeFileMeetingTranscriber } from './meeting/infrastructure/whole-file-meeting-transcriber';
import { MeetingFiles } from './meeting/infrastructure/files/meeting-files';
import { TaskExtractor } from './meeting/infrastructure/openrouter/task-extractor';
import {
    meetingTasksExtractionSettingsFromConfig,
    meetingTasksModelSetting,
} from './meeting/meeting-tasks-extraction.config';
import { MeetingTranscriptionQueue } from './meeting/infrastructure/queue/meeting-transcription.queue';
import { MeetingTranscriptionQueueModule } from './meeting/infrastructure/queue/meeting-transcription-queue.module';
import { MeetingTranscriptionProcessor } from './meeting/infrastructure/queue/meeting-transcription.processor';
import { MeetingTranscriptRepository } from './meeting/infrastructure/persistence/meeting-transcript.repository';
import { TranscriptSegmentRepository } from './meeting/infrastructure/persistence/transcript-segment.repository';
import { MeetingsAgentCapability } from './meeting/interface/agent/meetings-agent.capability';
import { MEETINGS_AGENT_CONFIG } from './meeting/interface/agent/meetings-agent.config';
import { MeetingTranscriptsController } from './meeting/interface/http/meeting-transcripts.controller';
import { registerMeetingTranscriptionErrorStatuses } from './meeting/interface/meeting-transcription-error-status';

const VOICE_REDIS = Symbol('VOICE_REDIS');

@Injectable()
class VoiceRedisLifecycle implements OnApplicationShutdown {
    constructor(@Inject(VOICE_REDIS) private readonly client: Redis) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.client.status === 'ready') await this.client.quit();
        else this.client.disconnect();
    }
}

// Маршруты закрыты глобальным JwtAuthGuard из AuthModule.
@Module({
    imports: [PostgresModule, FilesModule, DocumentsModule, MeetingTranscriptionQueueModule],
    controllers: [MeetingTranscriptsController, VoiceTranscriptionsController],
    providers: [
        // Голосовые Telegram.
        {
            provide: TranscriberPort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): TranscriberPort =>
                new Transcriber(Transcriber.settingsFromConfig(config)),
        },
        TranscribeVoiceUseCase,
        // Расшифровка голоса по HTTP для клиентских приложений.
        TranscribeUploadedVoiceUseCase,
        {
            provide: VOICE_REDIS,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): Redis => {
                const client = new Redis({
                    host: config.get('REDIS_HOST', { infer: true }),
                    port: config.get('REDIS_PORT', { infer: true }),
                    password: config.get('REDIS_PASSWORD', { infer: true }),
                    db: config.get('REDIS_DB', { infer: true }),
                    lazyConnect: true,
                    commandTimeout: 1000,
                    maxRetriesPerRequest: 1,
                });
                const logger = new Logger('VoiceRedis');
                client.on('error', (error: Error) => {
                    logger.error(error.message);
                });
                return client;
            },
        },
        VoiceRedisLifecycle,
        {
            provide: VoiceRateLimiterPort,
            inject: [VOICE_REDIS, ConfigService, PinoLogger],
            useFactory: (
                redis: Redis,
                config: ConfigService<Env, true>,
                logger: PinoLogger,
            ): VoiceRateLimiterPort =>
                new RedisVoiceRateLimiter(
                    redis,
                    {
                        limit: config.get('VOICE_TRANSCRIPTION_MAX_PER_MINUTE', { infer: true }),
                    },
                    logger,
                ),
        },
        {
            provide: VoiceAudioNormalizerPort,
            inject: [PinoLogger],
            useFactory: (logger: PinoLogger): VoiceAudioNormalizerPort =>
                new FfmpegVoiceAudioNormalizer(
                    { timeoutMs: DEFAULT_VOICE_NORMALIZE_TIMEOUT_MS },
                    logger,
                ),
        },
        // Расшифровка записей встреч.
        TranscribeMeetingUseCase,
        GetMeetingTranscriptUseCase,
        RenameSpeakersUseCase,
        GetSpeakerSamplesUseCase,
        MeetingDocuments,
        ExtractMeetingTasksUseCase,
        {
            provide: ExtractMeetingTasksSettings,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): ExtractMeetingTasksSettings =>
                meetingTasksExtractionSettingsFromConfig(config),
        },
        {
            provide: TaskExtractorPort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): TaskExtractorPort =>
                new TaskExtractor(() => createChatModel(config, meetingTasksModelSetting(config))),
        },
        RetryMeetingTranscriptionUseCase,
        {
            provide: MEETINGS_AGENT_CAPABILITY,
            inject: [
                ConfigService,
                GetMeetingTranscriptUseCase,
                GetSpeakerSamplesUseCase,
                RenameSpeakersUseCase,
                ExtractMeetingTasksUseCase,
                RetryMeetingTranscriptionUseCase,
                MeetingDocuments,
                MeetingFilesPort,
            ],
            useFactory: (
                config: ConfigService<Env, true>,
                getTranscript: GetMeetingTranscriptUseCase,
                speakerSamples: GetSpeakerSamplesUseCase,
                renameSpeakers: RenameSpeakersUseCase,
                extractTasks: ExtractMeetingTasksUseCase,
                retryTranscription: RetryMeetingTranscriptionUseCase,
                documents: MeetingDocuments,
                files: MeetingFilesPort,
            ): MeetingsAgentCapability =>
                new MeetingsAgentCapability(
                    {
                        getTranscript,
                        speakerSamples,
                        renameSpeakers,
                        extractTasks,
                        retryTranscription,
                        documents,
                        files,
                    },
                    createChatModel(config, MEETINGS_AGENT_CONFIG.model),
                ),
        },
        FailMeetingTranscriptionUseCase,
        StartMeetingTranscriptionOnFileUploaded,
        FailMeetingTranscriptionOnFileDeleted,
        MeetingTranscriptionEventSubscriptions,
        MeetingTranscriptionProcessor,
        { provide: MeetingFilesPort, useClass: MeetingFiles },
        { provide: MeetingTranscriptRepositoryPort, useClass: MeetingTranscriptRepository },
        { provide: TranscriptSegmentRepositoryPort, useClass: TranscriptSegmentRepository },
        { provide: MeetingTranscriptionQueuePort, useClass: MeetingTranscriptionQueue },
        {
            provide: MeetingAudioPreparerPort,
            inject: [ConfigService, PinoLogger],
            useFactory: (
                config: ConfigService<Env, true>,
                logger: PinoLogger,
            ): MeetingAudioPreparerPort =>
                new MeetingAudioPreparer(
                    MeetingAudioPreparer.settingsFromConfig(
                        config,
                        config.get('MEETING_TRANSCRIPTION_MAX_AUDIO_BYTES', { infer: true }),
                    ),
                    { logger },
                ),
        },
        {
            provide: WholeFileSttPort,
            inject: [ConfigService, PinoLogger],
            useFactory: (config: ConfigService<Env, true>, logger: PinoLogger): WholeFileSttPort =>
                new WholeFileStt(WholeFileStt.settingsFromConfig(config), logger),
        },
        {
            provide: MeetingTranscriberPort,
            inject: [MeetingAudioPreparerPort, WholeFileSttPort, PinoLogger],
            useFactory: (
                preparer: MeetingAudioPreparerPort,
                stt: WholeFileSttPort,
                logger: PinoLogger,
            ): MeetingTranscriberPort => new WholeFileMeetingTranscriber(preparer, stt, logger),
        },
    ],
    exports: [
        TranscribeVoiceUseCase,
        // Специалист по встречам для профиля «приложение» модуля assistant.
        MEETINGS_AGENT_CAPABILITY,
        // Для сообщения в чат по результату расшифровки (MeetingChatModule).
        MeetingDocuments,
        MeetingFilesPort,
        MeetingTranscriptRepositoryPort,
    ],
})
export class TranscriptionModule implements OnModuleInit {
    constructor(
        @Inject(VoiceAudioNormalizerPort) private readonly voiceAudio: VoiceAudioNormalizerPort,
    ) {}

    async onModuleInit(): Promise<void> {
        registerMeetingTranscriptionErrorStatuses();
        // Без ffmpeg голос отвечает 503; об этом пишется в лог при старте.
        if (this.voiceAudio instanceof FfmpegVoiceAudioNormalizer) {
            await this.voiceAudio.checkTools();
        }
    }
}
