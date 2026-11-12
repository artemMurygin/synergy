import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { PinoLogger } from 'nestjs-pino';
import { PG_POOL } from '../../database/postgres/database.constants';
import { PostgresModule } from '../../database/postgres/postgres.module';
import {
    SHEETS_QA_AGENT_CAPABILITY,
    TASKS_AGENT_CAPABILITY,
    type AgentCapability,
} from '../../shared/agent-capability';
import type { Env } from '../../shared/config/env.schema';
import { createChatModel } from '../../shared/llm';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { FilesModule } from '../files/files.module';
import { SheetsQaModule } from '../sheets-qa/sheets-qa.module';
import { TasksModule } from '../tasks/tasks.module';
import { ASSISTANT_CONFIG } from './assistant.config';
import { AskInTelegramUseCase } from './application/ask-in-telegram.use-case';
import { ClientProfileRegistry } from './application/client-profile-registry';
import { CancelAgentRunUseCase } from './application/cancel-agent-run.use-case';
import { CreateChatSessionUseCase } from './application/create-chat-session.use-case';
import { DeleteChatSessionUseCase } from './application/delete-chat-session.use-case';
import { FindFirstChatOfFileUseCase } from './application/find-first-chat-of-file.use-case';
import { GetChatMessagesUseCase } from './application/get-chat-messages.use-case';
import { ListChatSessionsUseCase } from './application/list-chat-sessions.use-case';
import { PostSystemMessageUseCase } from './application/post-system-message.use-case';
import { RenameChatSessionUseCase } from './application/rename-chat-session.use-case';
import { ResetTelegramDialogUseCase } from './application/reset-telegram-dialog.use-case';
import { StartAgentRunUseCase } from './application/start-agent-run.use-case';
import { PostSystemMessagePort } from './contracts/post-system-message.port';
import { registerAssistantEvents } from './contracts/register-assistant-events';
import { ActiveRunRegistryPort } from './domain/ports/active-run-registry.port';
import { AgentContextWriterPort } from './domain/ports/agent-context-writer.port';
import { AttachmentFilesPort } from './domain/ports/attachment-files.port';
import { AgentRunnerPort } from './domain/ports/agent-runner.port';
import { ChatSessionRepositoryPort } from './domain/ports/chat-session-repository.port';
import { ChatThreadPort } from './domain/ports/chat-thread.port';
import { ActiveRunsLifecycle } from './infrastructure/active-runs-lifecycle';
import { AgentProfileFactory } from './infrastructure/agent-profile-factory';
import { AgentRunner } from './infrastructure/agent-runner';
import { ActiveRunRegistry } from './infrastructure/active-run-registry';
import { ChatSessionRepository } from './infrastructure/chat-session-repository';
import { ChatThread } from './infrastructure/chat-thread';
import { FilesAttachmentLookup } from './infrastructure/files-attachment-lookup';
import { SystemMessageQueueModule } from './infrastructure/queue/system-message-queue.module';
import { SystemMessageProcessor } from './infrastructure/queue/system-message.processor';
import { SystemMessageQueue } from './infrastructure/queue/system-message.queue';
import {
    AGENT_CHECKPOINTER,
    CheckpointerLifecycle,
    createCheckpointer,
} from './infrastructure/checkpointer';
import { AgentController } from './interface/http/agent.controller';
import { ThreadsController } from './interface/http/threads.controller';

@Module({
    imports: [PostgresModule, FilesModule, SheetsQaModule, TasksModule, SystemMessageQueueModule],
    controllers: [AgentController, ThreadsController],
    providers: [
        StartAgentRunUseCase,
        AskInTelegramUseCase,
        ResetTelegramDialogUseCase,
        CreateChatSessionUseCase,
        ListChatSessionsUseCase,
        GetChatMessagesUseCase,
        RenameChatSessionUseCase,
        DeleteChatSessionUseCase,
        CancelAgentRunUseCase,
        PostSystemMessageUseCase,
        FindFirstChatOfFileUseCase,
        SystemMessageProcessor,
        { provide: PostSystemMessagePort, useClass: SystemMessageQueue },
        { provide: ActiveRunRegistryPort, useClass: ActiveRunRegistry },
        { provide: ChatSessionRepositoryPort, useClass: ChatSessionRepository },
        { provide: AttachmentFilesPort, useClass: FilesAttachmentLookup },
        {
            provide: AGENT_CHECKPOINTER,
            // PG_POOL is injected only to run after migrate(); setup() creates the library tables.
            inject: [ConfigService, PG_POOL],
            useFactory: (config: ConfigService<Env, true>): Promise<PostgresSaver> =>
                createCheckpointer(config.get('POSTGRES_URL', { infer: true })),
        },
        // Declared before CheckpointerLifecycle: runs are cancelled before the saver is closed.
        ActiveRunsLifecycle,
        CheckpointerLifecycle,
        {
            provide: ChatThreadPort,
            inject: [AGENT_CHECKPOINTER],
            useFactory: (saver: PostgresSaver): ChatThreadPort => new ChatThread(saver),
        },
        {
            provide: ClientProfileRegistry,
            useFactory: (): ClientProfileRegistry => new ClientProfileRegistry(),
        },
        {
            provide: AgentProfileFactory,
            inject: [
                ConfigService,
                ClientProfileRegistry,
                SHEETS_QA_AGENT_CAPABILITY,
                TASKS_AGENT_CAPABILITY,
                AGENT_CHECKPOINTER,
            ],
            useFactory: (
                config: ConfigService<Env, true>,
                registry: ClientProfileRegistry,
                sheetsQa: AgentCapability,
                tasks: AgentCapability,
                checkpointer: PostgresSaver,
            ): AgentProfileFactory =>
                new AgentProfileFactory({
                    registry,
                    sheetsQa,
                    tasks,
                    orchestratorModel: createChatModel(config, ASSISTANT_CONFIG.model),
                    checkpointer,
                }),
        },
        { provide: AgentContextWriterPort, useExisting: AgentProfileFactory },
        {
            provide: AgentRunnerPort,
            inject: [AgentProfileFactory, PinoLogger],
            useFactory: (agents: AgentProfileFactory, logger: PinoLogger): AgentRunnerPort =>
                new AgentRunner({
                    agents,
                    maxSteps: ASSISTANT_CONFIG.maxSteps,
                    timeoutMs: ASSISTANT_CONFIG.timeoutMs,
                    logger,
                }),
        },
    ],
    exports: [
        AskInTelegramUseCase,
        ResetTelegramDialogUseCase,
        // Contracts for other modules: post a system message into a chat and find the chat of a file.
        PostSystemMessagePort,
        PostSystemMessageUseCase,
        FindFirstChatOfFileUseCase,
    ],
})
export class AssistantModule implements OnModuleInit {
    constructor(private readonly events: DomainEventRegistry) {}

    onModuleInit(): void {
        registerAssistantEvents(this.events);
    }
}
