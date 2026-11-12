import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { CreateDownloadLinkUseCase } from './application/create-download-link.use-case';
import { DeleteFileUseCase } from './application/delete-file.use-case';
import { DownloadFileContentUseCase } from './application/download-file-content.use-case';
import { FindOwnedFilesUseCase } from './application/find-owned-files.use-case';
import { GetFileUseCase } from './application/get-file.use-case';
import { HoldFileUseCase } from './application/hold-file.use-case';
import { OpenFileForProcessingUseCase } from './application/open-file-for-processing.use-case';
import { PurgeExpiredFilesUseCase } from './application/purge-expired-files.use-case';
import { ReleaseFileHoldUseCase } from './application/release-file-hold.use-case';
import { StoreGeneratedFileUseCase } from './application/store-generated-file.use-case';
import { UploadFileUseCase } from './application/upload-file.use-case';
import { registerFileEvents } from './contracts/register-file-events';
import { FilesClockPort } from './domain/ports/clock.port';
import { DownloadTokenPort } from './domain/ports/download-token.port';
import { FilesSettingsPort } from './domain/ports/files-settings.port';
import { MediaTypeDetectorPort } from './domain/ports/media-type-detector.port';
import { ObjectStoragePort } from './domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from './domain/ports/stored-file-repository.port';
import { RetentionPolicy } from './domain/retention-policy';
import { createDownloadTokenService } from './infrastructure/download-token.factory';
import { FilesSettings } from './infrastructure/files-settings';
import { MediaTypeDetector } from './infrastructure/media-type-detector';
import { FilesMaintenanceQueueModule } from './infrastructure/queue/files-maintenance-queue.module';
import { FilesPurgeProcessor } from './infrastructure/queue/files-purge.processor';
import { FilesPurgeScheduler } from './infrastructure/queue/files-purge.scheduler';
import { ObjectStorage } from './infrastructure/s3/object-storage';
import { StoredFileRepository } from './infrastructure/persistence/stored-file.repository';
import { SystemFilesClock } from './infrastructure/system-files-clock';
import { registerFileErrorStatuses } from './interface/files-error-status';
import { FilesController } from './interface/http/files.controller';

// Маршруты закрыты глобальным JwtAuthGuard из AuthModule; публичен только GET /files/:id/content.
@Module({
    imports: [PostgresModule, FilesMaintenanceQueueModule],
    controllers: [FilesController],
    providers: [
        UploadFileUseCase,
        GetFileUseCase,
        DeleteFileUseCase,
        CreateDownloadLinkUseCase,
        DownloadFileContentUseCase,
        PurgeExpiredFilesUseCase,
        OpenFileForProcessingUseCase,
        HoldFileUseCase,
        ReleaseFileHoldUseCase,
        StoreGeneratedFileUseCase,
        FindOwnedFilesUseCase,
        FilesPurgeProcessor,
        FilesPurgeScheduler,
        { provide: FilesSettingsPort, useClass: FilesSettings },
        { provide: FilesClockPort, useClass: SystemFilesClock },
        { provide: StoredFileRepositoryPort, useClass: StoredFileRepository },
        { provide: MediaTypeDetectorPort, useClass: MediaTypeDetector },
        {
            provide: RetentionPolicy,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): RetentionPolicy =>
                new RetentionPolicy({
                    documentDays: config.get('FILES_DOCUMENT_RETENTION_DAYS', { infer: true }),
                    recordingDays: config.get('FILES_RECORDING_RETENTION_DAYS', { infer: true }),
                    maxHoldDays: config.get('FILES_MAX_HOLD_DAYS', { infer: true }),
                }),
        },
        {
            provide: ObjectStoragePort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): ObjectStoragePort =>
                new ObjectStorage({
                    endpoint: config.get('S3_ENDPOINT', { infer: true }),
                    region: config.get('S3_REGION', { infer: true }),
                    accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
                    secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
                    bucket: config.get('S3_BUCKET', { infer: true }),
                    forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
                }),
        },
        {
            provide: DownloadTokenPort,
            inject: [ConfigService, FilesClockPort],
            useFactory: (
                config: ConfigService<Env, true>,
                clock: FilesClockPort,
            ): DownloadTokenPort =>
                createDownloadTokenService(
                    config.get('FILES_DOWNLOAD_TOKEN_SECRET', { infer: true }),
                    clock,
                ),
        },
    ],
    exports: [
        OpenFileForProcessingUseCase,
        HoldFileUseCase,
        ReleaseFileHoldUseCase,
        StoreGeneratedFileUseCase,
        FindOwnedFilesUseCase,
    ],
})
export class FilesModule implements OnModuleInit {
    constructor(
        private readonly events: DomainEventRegistry,
        private readonly storage: ObjectStoragePort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(FilesModule.name);
    }

    async onModuleInit(): Promise<void> {
        registerFileErrorStatuses();
        registerFileEvents(this.events);
        // Недоступное хранилище не должно ронять остальные модули: файлы отвечают ошибкой до починки.
        try {
            await this.storage.ensureBucket();
        } catch (error: unknown) {
            this.logger.error({ err: error }, 'Failed to ensure the files bucket');
        }
    }
}
