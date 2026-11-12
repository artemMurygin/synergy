import type { DocumentModel } from './document-model';

export const DOCX_MEDIA_TYPE =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Модель документа → содержимое файла. Без I/O: сохраняет файл вызывающий модуль. */
export abstract class DocumentRendererPort {
    /** Тип содержимого результата, например `.docx`. */
    abstract readonly mediaType: string;
    /** Расширение имени файла с точкой: `.docx`. */
    abstract readonly extension: string;
    abstract render(doc: DocumentModel): Promise<Buffer>;
}
