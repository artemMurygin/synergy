import { Injectable } from '@nestjs/common';
import { FileGoneError } from '../domain/errors';
import { DownloadTokenPort } from '../domain/ports/download-token.port';
import { FilesSettingsPort } from '../domain/ports/files-settings.port';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { findOwnedFile } from './find-owned-file';
import type { FileOfOwnerInput } from './get-file.use-case';

export interface DownloadLink {
    url: string;
    expiresAt: Date;
}

/** 404 для чужого, 410 для удалённого. */
@Injectable()
export class CreateDownloadLinkUseCase {
    constructor(
        private readonly files: StoredFileRepositoryPort,
        private readonly tokens: DownloadTokenPort,
        private readonly settings: FilesSettingsPort,
    ) {}

    async execute({ ownerId, fileId }: FileOfOwnerInput): Promise<DownloadLink> {
        const file = await findOwnedFile(this.files, ownerId, fileId);
        if (file.isDeleted()) throw new FileGoneError(file.id);
        const { token, expiresAt } = this.tokens.sign(file.id, this.settings.downloadLinkTtlSec);
        return {
            url: `/files/${encodeURIComponent(file.id)}/content?token=${encodeURIComponent(token)}`,
            expiresAt,
        };
    }
}
