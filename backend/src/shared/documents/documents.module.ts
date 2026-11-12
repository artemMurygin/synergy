import { Module } from '@nestjs/common';
import { DocumentRendererPort } from './document-renderer.port';
import { DocxDocumentRenderer } from './infrastructure/docx-document-renderer';

/** Общий генератор документов: модули строят `DocumentModel`, файл собирает адаптер. */
@Module({
    providers: [{ provide: DocumentRendererPort, useClass: DocxDocumentRenderer }],
    exports: [DocumentRendererPort],
})
export class DocumentsModule {}
