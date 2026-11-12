import type { FileKind } from '../domain/file-kind';
import type { StoredFile, StoredFileStatus } from '../domain/stored-file';

export interface StoredFileView {
    id: string;
    name: string;
    mediaType: string;
    kind: FileKind;
    sizeBytes: number;
    status: StoredFileStatus;
    /** Запись ждёт обработки: срок хранения ещё не назначен. */
    awaitingProcessing: boolean;
    uploadedAt: Date;
    /** Пусто, пока запись удерживается, и у удалённого файла. */
    expiresAt: Date | null;
    deletedAt: Date | null;
}

export function toStoredFileView(file: StoredFile): StoredFileView {
    const deleted = file.isDeleted();
    return {
        id: file.id,
        name: file.name.value,
        mediaType: file.mediaType.mime,
        kind: file.kind,
        sizeBytes: file.sizeBytes,
        status: file.status,
        awaitingProcessing: file.isAwaitingProcessing(),
        uploadedAt: file.uploadedAt,
        expiresAt: deleted ? null : file.retention.expiresAt,
        deletedAt: file.deletedAt,
    };
}
