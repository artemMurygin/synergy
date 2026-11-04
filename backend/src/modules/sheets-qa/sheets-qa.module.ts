import { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../shared/config/env.schema';
import {
    DEFAULT_BOOK,
    OPENROUTER_BASE_URL,
    type ModelSetting,
    SHEETS_QA_BOOKS,
    SEARCHERS,
    SHEETS_QA_CONFIG,
} from './sheets-qa.config';
import { BookRegistry } from './application/book-registry';
import { AskQuestionUseCase } from './application/ask-question.use-case';
import { SheetsAssistantPort } from './domain/ports/sheets-assistant.port';
import { BookLibraryPort } from './domain/ports/book-library.port';
import { FileSheetGuides } from './infrastructure/file-sheet-guides';
import { ExcelJsWorkbookReader } from './infrastructure/exceljs-workbook-reader';
import { DeepAgentsSheetsAssistant } from './infrastructure/deepagents-sheets-assistant';
import { SheetsQaController } from './interface/http/sheets-qa.controller';

@Module({
    controllers: [SheetsQaController],
    providers: [
        AskQuestionUseCase,
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
            provide: SheetsAssistantPort,
            inject: [ConfigService, BookLibraryPort],
            useFactory: (
                config: ConfigService<Env, true>,
                library: BookLibraryPort,
            ): SheetsAssistantPort => {
                const baseURL = config.get('OPENAI_BASE_URL', { infer: true });
                const openRouterKey = config.get('OPENROUTER_API_KEY', { infer: true });
                const createModel = (setting: ModelSetting): ChatOpenAI => {
                    if (setting.provider === 'omniroute') {
                        return new ChatOpenAI({
                            model: setting.name,
                            apiKey: config.get('OPENAI_API_KEY', { infer: true }),
                            temperature: 0,
                            ...(baseURL === undefined ? {} : { configuration: { baseURL } }),
                        });
                    }
                    if (openRouterKey === undefined) {
                        throw new Error(`OPENROUTER_API_KEY is required for model ${setting.name}`);
                    }
                    return new ChatOpenAI({
                        model: setting.name,
                        apiKey: openRouterKey,
                        temperature: 0,
                        configuration: { baseURL: OPENROUTER_BASE_URL },
                        modelKwargs: {
                            provider: { sort: 'throughput' },
                            ...(setting.reasoningEffort === undefined
                                ? {}
                                : { reasoning: { effort: setting.reasoningEffort } }),
                        },
                    });
                };
                return new DeepAgentsSheetsAssistant({
                    model: createModel(SHEETS_QA_CONFIG.model),
                    subagentModel: createModel(SHEETS_QA_CONFIG.subagentModel),
                    library,
                    dataDir: SHEETS_QA_CONFIG.dataDir,
                    maxAnswerChars: SHEETS_QA_CONFIG.limits.maxAnswerChars,
                    levels: SEARCHERS,
                    maxSteps: SHEETS_QA_CONFIG.maxSteps,
                    timeoutMs: SHEETS_QA_CONFIG.timeoutMs,
                });
            },
        },
    ],
})
export class SheetsQaModule {}
