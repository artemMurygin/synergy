import type { StoredFile } from '../domain/stored-file';
import type { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';
import { FileNotFoundError } from './errors';

// Чужой и несуществующий файл неразличимы: оба дают FileNotFoundError.
export function assertOwned(file: StoredFile | null, ownerId: string, fileId: string): StoredFile {
    if (file?.ownerId !== ownerId) throw new FileNotFoundError(fileId);
    return file;
}

export async function findOwnedFile(
    files: StoredFileRepositoryPort,
    ownerId: string,
    fileId: string,
): Promise<StoredFile> {
    return assertOwned(await files.findById(fileId), ownerId, fileId);
}
