import type { StoredFileView } from '../../../files/application/stored-file-view';

export interface GeneratedDocumentInput {
    ownerId: string;
    /** Имя файла с расширением. */
    name: string;
    mediaType: string;
    buffer: Buffer;
}

/** Сохраняет созданный на сервере документ как файл пользователя вида `document`. */
export abstract class GeneratedDocumentStore {
    abstract store(input: GeneratedDocumentInput): Promise<StoredFileView>;
}
