import { Injectable } from '@nestjs/common';
import { StoreGeneratedFileUseCase } from '../../files/application/store-generated-file.use-case';
import type { StoredFileView } from '../../files/application/stored-file-view';
import {
    GeneratedDocumentStorePort,
    type GeneratedDocumentInput,
} from '../domain/ports/generated-document-store.port';

/** Адаптер к модулю `files`: документ сохраняется обычным файлом владельца вида `document`. */
@Injectable()
export class GeneratedDocumentStore extends GeneratedDocumentStorePort {
    constructor(private readonly storeGeneratedFile: StoreGeneratedFileUseCase) {
        super();
    }

    store(input: GeneratedDocumentInput): Promise<StoredFileView> {
        return this.storeGeneratedFile.execute(input);
    }
}
