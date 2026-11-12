import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { UnsupportedMediaTypeError } from '../domain/errors';
import { FileName } from '../domain/file-name';
import { MediaType } from '../domain/media-type';
import { RetentionPolicy } from '../domain/retention-policy';
import { StoredFile } from '../domain/stored-file';
import { FilesClockPort } from '../domain/ports/clock.port';
import { FilesSettingsPort } from '../domain/ports/files-settings.port';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { EmptyFileError } from './errors';
import { toStoredFileView, type StoredFileView } from './stored-file-view';

export interface StoreGeneratedFileInput {
    ownerId: string;
    name: string;
    mediaType: string;
    buffer: Buffer;
}

/**
 * Сохраняет файл, созданный на сервере (например, `.docx` встречи), как обычный документ владельца:
 * обычный срок хранения и событие `file.uploaded`. Тип задаёт вызывающий, а не детектор.
 */
@Injectable()
export class StoreGeneratedFileUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly settings: FilesSettingsPort,
        private readonly policy: RetentionPolicy,
        private readonly clock: FilesClockPort,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(StoreGeneratedFileUseCase.name);
    }

    async execute(input: StoreGeneratedFileInput): Promise<StoredFileView> {
        const name = FileName.of(input.name);
        const mediaType = MediaType.of(input.mediaType);
        if (mediaType.kind !== 'document') throw new UnsupportedMediaTypeError(mediaType.mime);
        if (input.buffer.length === 0) throw new EmptyFileError();

        const id = randomUUID();
        const storageKey = `${input.ownerId}/${id}`;
        const { sizeBytes } = await this.storage.put(Readable.from([input.buffer]), {
            key: storageKey,
            contentType: mediaType.mime,
            maxBytes: this.settings.maxDocumentBytes,
        });

        const file = StoredFile.upload(
            {
                id,
                ownerId: input.ownerId,
                name,
                mediaType,
                sizeBytes,
                storageKey,
                now: this.clock.now(),
            },
            this.policy,
        );
        try {
            await this.transactions.run(async () => {
                await this.files.save(file);
                await this.events.publish(file.pullDomainEvents());
            });
        } catch (error) {
            await this.compensate(file);
            throw error;
        }
        return toStoredFileView(file);
    }

    private async compensate(file: StoredFile): Promise<void> {
        try {
            await this.storage.delete(file.storageKey);
        } catch (error: unknown) {
            this.logger.error(
                { fileId: file.id, err: error },
                'Orphan object left after a failed generated file store',
            );
        }
    }
}
