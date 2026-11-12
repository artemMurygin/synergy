import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { openStoredObject } from './open-stored-object';

export interface FileForProcessing {
    stream: Readable;
    contentType: string;
    sizeBytes: number;
}

/** Для внутренних модулей, без проверки владельца. `null`, если файла нет или он удалён. */
@Injectable()
export class OpenFileForProcessingUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(OpenFileForProcessingUseCase.name);
    }

    async execute(fileId: string): Promise<FileForProcessing | null> {
        const file = await this.files.findById(fileId);
        if (file === null || file.isDeleted()) return null;

        const { files, storage, logger } = this;
        const stream = await openStoredObject({ files, storage, logger }, file);
        if (stream === null) return null;
        return { stream, contentType: file.mediaType.mime, sizeBytes: file.sizeBytes };
    }
}
