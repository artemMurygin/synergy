import { HttpStatus } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { findErrorStatus } from '../../shared/http/error-status.registry';
import { HoldFileUseCase } from './application/hold-file.use-case';
import { OpenFileForProcessingUseCase } from './application/open-file-for-processing.use-case';
import { ReleaseFileHoldUseCase } from './application/release-file-hold.use-case';
import { FindOwnedFilesUseCase } from './application/find-owned-files.use-case';
import { StoreGeneratedFileUseCase } from './application/store-generated-file.use-case';
import { FILE_UPLOADED_EVENT_TYPE } from './domain/events/file-uploaded.event';
import type { ObjectStoragePort } from './domain/ports/object-storage.port';
import { FilesModule } from './files.module';
import { DownloadLinksUnavailableError } from './application/errors';
import { FILE_DELETED_EVENT_TYPE } from './domain/events/file-deleted.event';
import { createDownloadTokenService } from './infrastructure/download-token.factory';
import { FilesSettings } from './infrastructure/files-settings';
import { DownloadTokenService } from './infrastructure/jwt/download-token.service';

function fakeStorage(ensureBucket = vi.fn().mockResolvedValue(undefined)): ObjectStoragePort {
    return {
        ensureBucket,
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
    };
}

const silentLogger = (): PinoLogger => new PinoLogger({ pinoHttp: { level: 'silent' } });

describe('FilesModule', () => {
    it('exports only the use cases meant for other modules', () => {
        const exported: unknown = Reflect.getMetadata(MODULE_METADATA.EXPORTS, FilesModule);

        expect(exported).toHaveLength(5);
        expect(exported).toEqual(
            expect.arrayContaining([
                OpenFileForProcessingUseCase,
                HoldFileUseCase,
                ReleaseFileHoldUseCase,
                StoreGeneratedFileUseCase,
                FindOwnedFilesUseCase,
            ]),
        );
    });

    it('creates the bucket, registers the file events and error statuses on start', async () => {
        const ensureBucket = vi.fn().mockResolvedValue(undefined);
        const registry = new DomainEventRegistry();
        const registerEvent = vi.spyOn(registry, 'registerEvent');
        const module = new FilesModule(registry, fakeStorage(ensureBucket), silentLogger());

        await module.onModuleInit();

        expect(ensureBucket).toHaveBeenCalledTimes(1);
        expect(registerEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: FILE_UPLOADED_EVENT_TYPE }),
        );
        expect(registerEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: FILE_DELETED_EVENT_TYPE }),
        );
        expect(findErrorStatus('FILE_NOT_FOUND')).toBe(HttpStatus.NOT_FOUND);
        expect(findErrorStatus('FILE_EMPTY')).toBe(HttpStatus.BAD_REQUEST);
        expect(findErrorStatus('FILE_DOWNLOAD_TOKEN_INVALID')).toBe(HttpStatus.FORBIDDEN);
        expect(findErrorStatus('FILE_GONE')).toBe(HttpStatus.GONE);
        expect(findErrorStatus('FILE_TOO_LARGE')).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(findErrorStatus('FILE_UNSUPPORTED_MEDIA_TYPE')).toBe(
            HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
        expect(findErrorStatus('FILE_DOWNLOAD_LINKS_UNAVAILABLE')).toBe(
            HttpStatus.SERVICE_UNAVAILABLE,
        );
    });

    it('keeps the application starting when the storage is unreachable', async () => {
        const failure = new Error('connect ECONNREFUSED');
        const ensureBucket = vi.fn().mockRejectedValue(failure);
        const logger = silentLogger();
        const error = vi.spyOn(logger, 'error');
        const module = new FilesModule(
            new DomainEventRegistry(),
            fakeStorage(ensureBucket),
            logger,
        );

        await expect(module.onModuleInit()).resolves.toBeUndefined();
        expect(ensureBucket).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith({ err: failure }, 'Failed to ensure the files bucket');
    });
});

describe('FilesSettings', () => {
    it('converts megabytes to bytes and reads the link TTL', () => {
        const settings = new FilesSettings(
            new ConfigService({
                FILES_MAX_RECORDING_MB: 1024,
                FILES_MAX_DOCUMENT_MB: 50,
                FILES_DOWNLOAD_LINK_TTL_SEC: 300,
            }),
        );

        expect(settings.maxRecordingBytes).toBe(1024 * 1024 * 1024);
        expect(settings.maxDocumentBytes).toBe(50 * 1024 * 1024);
        expect(settings.downloadLinkTtlSec).toBe(300);
    });
});

describe('createDownloadTokenService', () => {
    const clock = { now: () => new Date('2026-11-06T10:00:00.000Z') };

    it('uses the JWT service when the secret is set', () => {
        expect(createDownloadTokenService('x'.repeat(32), clock)).toBeInstanceOf(
            DownloadTokenService,
        );
    });

    it('refuses to sign links and rejects every token without the secret', () => {
        const tokens = createDownloadTokenService(undefined, clock);

        expect(() => tokens.sign('file-1', 300)).toThrow(DownloadLinksUnavailableError);
        expect(tokens.verify('any-token', 'file-1')).toBe(false);
    });
});
