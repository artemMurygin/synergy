import type { Readable } from 'node:stream';
import type { PinoLogger } from 'nestjs-pino';
import type { StoredFile } from '../domain/stored-file';
import type { ObjectStoragePort } from '../domain/ports/object-storage.port';
import type { StoredFileRepositoryPort } from '../domain/ports/stored-file-repository.port';

export interface OpenStoredObjectDeps {
    files: StoredFileRepositoryPort;
    storage: ObjectStoragePort;
    logger: PinoLogger;
}

/** `null`, если объекта нет. Удаление между чтением строки и объекта — штатная гонка, не ошибка. */
export async function openStoredObject(
    { files, storage, logger }: OpenStoredObjectDeps,
    file: StoredFile,
): Promise<Readable | null> {
    const stream = await storage.get(file.storageKey);
    if (stream !== null) return stream;
    const current = await files.findById(file.id);
    if (current !== null && !current.isDeleted()) {
        logger.error({ fileId: file.id }, 'Object of an active file is missing');
    }
    return null;
}
