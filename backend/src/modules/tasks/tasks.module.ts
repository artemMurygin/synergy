import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { TASKS_AGENT_CAPABILITY } from '../../shared/agent-capability';
import { DocumentsModule } from '../../shared/documents';
import { FilesModule } from '../files/files.module';
import type { Env } from '../../shared/config/env.schema';
import { createChatModel } from '../../shared/llm';
import { TASKS_AGENT_CONFIG } from './tasks-agent.config';
import { DomainEventRegistry } from '../../shared/outbox/application/domain-event-registry';
import { CreateTaskUseCase } from './application/create-task.use-case';
import { CreateTasksFromDraftUseCase } from './application/create-tasks-from-draft.use-case';
import { DeleteAttachmentUseCase } from './application/delete-attachment.use-case';
import { DeleteTaskUseCase } from './application/delete-task.use-case';
import { DownloadAttachmentUseCase } from './application/download-attachment.use-case';
import { GetTaskUseCase } from './application/get-task.use-case';
import { ListTasksUseCase } from './application/list-tasks.use-case';
import { ProposeTasksUseCase } from './application/propose-tasks.use-case';
import { TasksReportDocument } from './application/tasks-report-document';
import { UpdateTaskUseCase } from './application/update-task.use-case';
import { UploadAttachmentUseCase } from './application/upload-attachment.use-case';
import { registerTaskEvents } from './contracts/register-task-events';
import { Clock } from './domain/ports/clock.port';
import { FileStorage } from './domain/ports/file-storage.port';
import { GeneratedDocumentStore } from './domain/ports/generated-document-store.port';
import { TaskAccessPolicy } from './domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from './domain/ports/task-attachment-repository.port';
import { TaskBatchDraftRepository } from './domain/ports/task-batch-draft-repository.port';
import { TaskRepository } from './domain/ports/task-repository.port';
import { TasksSettings } from './domain/ports/tasks-settings.port';
import { UserDirectory } from './domain/ports/user-directory.port';
import { AllowAllTaskAccessPolicy } from './infrastructure/allow-all-task-access-policy';
import { EnvTasksSettings } from './infrastructure/env-tasks-settings';
import { FilesGeneratedDocumentStore } from './infrastructure/files-generated-document-store';
import { LocalDiskFileStorage } from './infrastructure/local-disk-file-storage';
import { SlonikTaskAttachmentRepository } from './infrastructure/slonik-task-attachment.repository';
import { SlonikTaskBatchDraftRepository } from './infrastructure/slonik-task-batch-draft.repository';
import { SlonikTaskRepository } from './infrastructure/slonik-task.repository';
import { SlonikUserDirectory } from './infrastructure/slonik-user-directory';
import { SystemClock } from './infrastructure/system-clock';
import {
    TASKS_AGENT_SKILLS_DIR,
    assertTaskSkillsPresent,
} from './interface/agent/tasks-agent-skills';
import { TasksAgentCapability } from './interface/agent/tasks-agent.capability';
import { TaskAttachmentsController } from './interface/http/task-attachments.controller';
import { TasksController } from './interface/http/tasks.controller';
import { registerTaskErrorStatuses } from './interface/tasks-error-status';

// Routes are protected by the global JwtAuthGuard registered in AuthModule (deny by default).
@Module({
    imports: [
        PostgresModule,
        FilesModule,
        DocumentsModule,
        MulterModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                limits: { fileSize: new EnvTasksSettings(config).maxFileSizeBytes },
            }),
        }),
    ],
    controllers: [TasksController, TaskAttachmentsController],
    providers: [
        CreateTaskUseCase,
        GetTaskUseCase,
        ListTasksUseCase,
        UpdateTaskUseCase,
        DeleteTaskUseCase,
        UploadAttachmentUseCase,
        DownloadAttachmentUseCase,
        DeleteAttachmentUseCase,
        ProposeTasksUseCase,
        CreateTasksFromDraftUseCase,
        TasksReportDocument,
        EnvTasksSettings,
        { provide: TasksSettings, useExisting: EnvTasksSettings },
        { provide: TaskRepository, useClass: SlonikTaskRepository },
        { provide: TaskAttachmentRepository, useClass: SlonikTaskAttachmentRepository },
        { provide: TaskBatchDraftRepository, useClass: SlonikTaskBatchDraftRepository },
        { provide: GeneratedDocumentStore, useClass: FilesGeneratedDocumentStore },
        { provide: UserDirectory, useClass: SlonikUserDirectory },
        { provide: TaskAccessPolicy, useClass: AllowAllTaskAccessPolicy },
        { provide: Clock, useClass: SystemClock },
        {
            provide: FileStorage,
            inject: [EnvTasksSettings],
            useFactory: (settings: EnvTasksSettings): FileStorage =>
                new LocalDiskFileStorage(settings.storageDir),
        },
        {
            provide: TASKS_AGENT_CAPABILITY,
            inject: [
                ConfigService,
                ProposeTasksUseCase,
                CreateTasksFromDraftUseCase,
                GetTaskUseCase,
                ListTasksUseCase,
                UpdateTaskUseCase,
                UserDirectory,
                Clock,
            ],
            useFactory: (
                config: ConfigService<Env, true>,
                proposeTasks: ProposeTasksUseCase,
                createTasksFromDraft: CreateTasksFromDraftUseCase,
                getTask: GetTaskUseCase,
                listTasks: ListTasksUseCase,
                updateTask: UpdateTaskUseCase,
                users: UserDirectory,
                clock: Clock,
            ): TasksAgentCapability => {
                assertTaskSkillsPresent(TASKS_AGENT_SKILLS_DIR);
                return new TasksAgentCapability(
                    { proposeTasks, createTasksFromDraft, getTask, listTasks, updateTask, users },
                    createChatModel(config, TASKS_AGENT_CONFIG.model),
                    clock,
                    TASKS_AGENT_SKILLS_DIR,
                );
            },
        },
    ],
    exports: [TASKS_AGENT_CAPABILITY],
})
export class TasksModule implements OnModuleInit {
    constructor(private readonly events: DomainEventRegistry) {}

    onModuleInit(): void {
        registerTaskErrorStatuses();
        registerTaskEvents(this.events);
    }
}
