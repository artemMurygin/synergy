import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SHEETS_QA_AGENT_CAPABILITY } from '../../shared/agent-capability';
import type { Env } from '../../shared/config/env.schema';
import { createChatModel } from '../../shared/llm';
import { DEFAULT_BOOK, SEARCHERS, SHEETS_QA_BOOKS, SHEETS_QA_CONFIG } from './sheets-qa.config';
import { BookRegistry } from './application/book-registry';
import { BookLibraryPort } from './domain/ports/book-library.port';
import { FileSheetGuides } from './infrastructure/file-sheet-guides';
import { ExcelJsWorkbookReader } from './infrastructure/exceljs-workbook-reader';
import { SheetsQaAgentCapability } from './infrastructure/sheets-qa-agent-capability';

@Module({
    providers: [
        {
            provide: BookLibraryPort,
            // Readers load their workbook on the first request, so seven books cost nothing at startup.
            useFactory: (): BookLibraryPort =>
                new BookRegistry(
                    SHEETS_QA_BOOKS.map((book) => ({
                        id: book.id,
                        description: book.description,
                        reader: new ExcelJsWorkbookReader({
                            file: book.workbookFile,
                            layouts: book.layouts,
                            overrides: book.overrides,
                            linkRules: book.linkRules,
                            gids: book.gids,
                            limits: SHEETS_QA_CONFIG.limits,
                        }),
                        guides: new FileSheetGuides(
                            book.structureFile,
                            book.guidesDir,
                            book.guideAliases,
                        ),
                    })),
                    DEFAULT_BOOK,
                ),
        },
        {
            provide: SHEETS_QA_AGENT_CAPABILITY,
            inject: [ConfigService, BookLibraryPort],
            useFactory: (
                config: ConfigService<Env, true>,
                library: BookLibraryPort,
            ): SheetsQaAgentCapability => {
                return new SheetsQaAgentCapability({
                    model: createChatModel(config, SHEETS_QA_CONFIG.model),
                    subagentModel: createChatModel(config, SHEETS_QA_CONFIG.subagentModel),
                    library,
                    catalog: readFileSync(join(SHEETS_QA_CONFIG.dataDir, 'catalog.md'), 'utf8'),
                    levels: SEARCHERS,
                    maxAnswerChars: SHEETS_QA_CONFIG.limits.maxAnswerChars,
                });
            },
        },
    ],
    exports: [BookLibraryPort, SHEETS_QA_AGENT_CAPABILITY],
})
export class SheetsQaModule {}
