import { Module } from '@nestjs/common';
import { DocumentRendererPort } from './document-renderer.port';
import { DocumentRenderer } from './infrastructure/document-renderer';

/** Общий генератор документов: модули строят `DocumentModel`, файл собирает адаптер. */
@Module({
    providers: [{ provide: DocumentRendererPort, useClass: DocumentRenderer }],
    exports: [DocumentRendererPort],
})
export class DocumentsModule {}
