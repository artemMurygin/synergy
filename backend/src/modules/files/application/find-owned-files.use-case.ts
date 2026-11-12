import { Injectable } from '@nestjs/common';
import { FileGoneError } from '../domain/errors';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { findOwnedFile } from './find-owned-file';
import { toStoredFileView, type StoredFileView } from './stored-file-view';

export interface FindOwnedFilesInput {
    ownerId: string;
    fileIds: readonly string[];
}

/**
 * Проверка вложений: все файлы свои и `active`. Порядок ответа — как во входе.
 * Чужой или несуществующий — FileNotFoundError(id), удалённый — FileGoneError(id).
 */
@Injectable()
export class FindOwnedFilesUseCase {
    constructor(private readonly files: StoredFileRepositoryPort) {}

    async execute({ ownerId, fileIds }: FindOwnedFilesInput): Promise<StoredFileView[]> {
        const views: StoredFileView[] = [];
        // Вложений немного (до 5), поэтому чтение по одному и по порядку.
        for (const fileId of fileIds) {
            const file = await findOwnedFile(this.files, ownerId, fileId);
            if (file.isDeleted()) throw new FileGoneError(fileId);
            views.push(toStoredFileView(file));
        }
        return views;
    }
}
