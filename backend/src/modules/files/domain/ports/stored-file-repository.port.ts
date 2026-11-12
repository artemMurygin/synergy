import type { RetentionPolicy } from '../retention-policy';
import type { StoredFile } from '../stored-file';

export interface StoredFileCursor {
    uploadedAt: Date;
    id: string;
}

export abstract class StoredFileRepositoryPort {
    abstract save(file: StoredFile): Promise<void>;
    abstract findById(id: string): Promise<StoredFile | null>;
    /** Блокирует строку до конца текущей транзакции: read-modify-write без потерянных обновлений. */
    abstract findByIdForUpdate(id: string): Promise<StoredFile | null>;
    /**
     * Активные файлы, срок которых наступил к `now`, в порядке `(uploadedAt, id)` после `after`.
     * Курсор, а не повторная выборка с начала: упавшие файлы не загораживают остальные.
     */
    abstract findExpired(
        now: Date,
        policy: RetentionPolicy,
        limit: number,
        after: StoredFileCursor | null,
    ): Promise<StoredFile[]>;
}
