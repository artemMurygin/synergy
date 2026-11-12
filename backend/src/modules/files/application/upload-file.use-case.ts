import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import type { FileKind } from '../domain/file-kind';
import { FileName } from '../domain/file-name';
import { RetentionPolicy } from '../domain/retention-policy';
import { StoredFile } from '../domain/stored-file';
import { FilesClockPort } from '../domain/ports/clock.port';
import { FilesSettingsPort } from '../domain/ports/files-settings.port';
import {
    MEDIA_TYPE_HEAD_BYTES,
    MediaTypeDetectorPort,
} from '../domain/ports/media-type-detector.port';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { EmptyFileError } from './errors';
import { readHead } from './read-head';
import { toStoredFileView, type StoredFileView } from './stored-file-view';

export interface UploadFileInput {
    ownerId: string;
    fileName: string;
    stream: Readable;
}

@Injectable()
export class UploadFileUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly detector: MediaTypeDetectorPort,
        private readonly settings: FilesSettingsPort,
        private readonly policy: RetentionPolicy,
        private readonly clock: FilesClockPort,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(UploadFileUseCase.name);
    }

    /** 400 — пустой файл или плохое имя, 413 — сверх лимита вида, 415 — тип вне белого списка. */
    async execute(input: UploadFileInput): Promise<StoredFileView> {
        const name = FileName.of(input.fileName);
        const { head, stream } = await readHead(input.stream, MEDIA_TYPE_HEAD_BYTES);
        if (head.length === 0) {
            stream.destroy();
            throw new EmptyFileError();
        }
        let mediaType;
        try {
            mediaType = await this.detector.detect(head, name.value);
        } catch (error) {
            stream.destroy();
            throw error;
        }

        const id = randomUUID();
        const storageKey = `${input.ownerId}/${id}`;
        const { sizeBytes } = await this.storage.put(stream, {
            key: storageKey,
            contentType: mediaType.mime,
            maxBytes: this.maxBytes(mediaType.kind),
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

    private maxBytes(kind: FileKind): number {
        return kind === 'recording'
            ? this.settings.maxRecordingBytes
            : this.settings.maxDocumentBytes;
    }

    private async compensate(file: StoredFile): Promise<void> {
        try {
            await this.storage.delete(file.storageKey);
        } catch (error: unknown) {
            this.logger.error(
                { fileId: file.id, err: error },
                'Orphan object left after a failed upload',
            );
        }
    }
}
