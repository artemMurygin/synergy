import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { FileGoneError } from '../domain/errors';
import { DownloadTokenPort } from '../domain/ports/download-token.port';
import { ObjectStoragePort } from '../domain/ports/object-storage.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { FileNotFoundError, InvalidDownloadTokenError } from './errors';
import { openStoredObject } from './open-stored-object';

export interface DownloadFileContentInput {
    fileId: string;
    token: string;
}

export interface FileContent {
    stream: Readable;
    name: string;
    contentType: string;
    sizeBytes: number;
}

/** Доступ по токену, без владельца: 403 для плохого токена, 410 для удалённого. */
@Injectable()
export class DownloadFileContentUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly storage: ObjectStoragePort,
        private readonly tokens: DownloadTokenPort,
        private readonly logger: PinoLogger,
    ) {
        this.logger.setContext(DownloadFileContentUseCase.name);
    }

    async execute({ fileId, token }: DownloadFileContentInput): Promise<FileContent> {
        // Токен проверяется первым, чтобы не раскрывать существование файла.
        if (!this.tokens.verify(token, fileId)) throw new InvalidDownloadTokenError();
        const file = await this.files.findById(fileId);
        if (file === null) throw new FileNotFoundError(fileId);
        if (file.isDeleted()) throw new FileGoneError(file.id);

        const { files, storage, logger } = this;
        const stream = await openStoredObject({ files, storage, logger }, file);
        if (stream === null) throw new FileGoneError(file.id);
        return {
            stream,
            name: file.name.value,
            contentType: file.mediaType.mime,
            sizeBytes: file.sizeBytes,
        };
    }
}
