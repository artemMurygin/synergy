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
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { ChatSessionRepositoryPort } from './domain/ports/chat-session-repository.port';
import { PostgresChatSessionRepository } from './infrastructure/postgres-chat-session-repository';
import { ChatThreadPort } from './domain/ports/chat-thread.port';
import { PostgresChatThread } from './infrastructure/postgres-chat-thread';
import {
    AGENT_CHECKPOINTER,
    CheckpointerLifecycle,
    createPostgresCheckpointer,
} from './infrastructure/postgres-checkpointer';
import { PG_POOL } from '../../database/postgres/database.constants';
import { ThreadsController } from './interface/http/threads.controller';
import { CancelAgentRunUseCase } from './application/cancel-agent-run.use-case';
import { ActiveRunRegistryPort } from './domain/ports/active-run-registry.port';
import { InMemoryActiveRunRegistry } from './infrastructure/in-memory-active-run-registry';
import { CreateChatSessionUseCase } from './application/create-chat-session.use-case';
import { ListChatSessionsUseCase } from './application/list-chat-sessions.use-case';
import { GetChatMessagesUseCase } from './application/get-chat-messages.use-case';
import { RenameChatSessionUseCase } from './application/rename-chat-session.use-case';
import { DeleteChatSessionUseCase } from './application/delete-chat-session.use-case';
import { SheetsQaController } from './interface/http/sheets-qa.controller';

@Module({
    imports: [PostgresModule],
    controllers: [SheetsQaController, ThreadsController],
    providers: [
        AskQuestionUseCase,
        CreateChatSessionUseCase,
        ListChatSessionsUseCase,
        GetChatMessagesUseCase,
        RenameChatSessionUseCase,
        DeleteChatSessionUseCase,
        CancelAgentRunUseCase,
        { provide: ActiveRunRegistryPort, useClass: InMemoryActiveRunRegistry },
        { provide: ChatSessionRepositoryPort, useClass: PostgresChatSessionRepository },
        {
            provide: AGENT_CHECKPOINTER,
            // PG_POOL is injected only to run after migrate(); setup() creates the library tables.
            inject: [ConfigService, PG_POOL],
            useFactory: (config: ConfigService<Env, true>): Promise<PostgresSaver> =>
                createPostgresCheckpointer(config.get('POSTGRES_URL', { infer: true })),
        },
        CheckpointerLifecycle,
        {
            provide: ChatThreadPort,
            inject: [AGENT_CHECKPOINTER],
            useFactory: (saver: PostgresSaver): ChatThreadPort => new PostgresChatThread(saver),
        },
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
            inject: [ConfigService, BookLibraryPort, AGENT_CHECKPOINTER],
            useFactory: (
                config: ConfigService<Env, true>,
                library: BookLibraryPort,
                checkpointer: PostgresSaver,
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
                            ...(setting.promptCache === true
                                ? { cache_control: { type: 'ephemeral' } }
                                : {}),
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
                    checkpointer,
                });
            },
        },
    ],
})
export class SheetsQaModule {}
