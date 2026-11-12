import { Injectable } from '@nestjs/common';
import { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { findOwnedFile } from './find-owned-file';
import { toStoredFileView, type StoredFileView } from './stored-file-view';

export interface FileOfOwnerInput {
    ownerId: string;
    fileId: string;
}

/** Метаданные, в том числе удалённого файла; 404 для чужого и несуществующего. */
@Injectable()
export class GetFileUseCase {
    constructor(private readonly files: StoredFileRepositoryPort) {}

    async execute({ ownerId, fileId }: FileOfOwnerInput): Promise<StoredFileView> {
        return toStoredFileView(await findOwnedFile(this.files, ownerId, fileId));
    }
}
