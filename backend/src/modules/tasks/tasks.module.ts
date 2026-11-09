import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { CreateTaskUseCase } from './application/create-task.use-case';
import { DeleteAttachmentUseCase } from './application/delete-attachment.use-case';
import { DeleteTaskUseCase } from './application/delete-task.use-case';
import { DownloadAttachmentUseCase } from './application/download-attachment.use-case';
import { GetTaskUseCase } from './application/get-task.use-case';
import { ListTasksUseCase } from './application/list-tasks.use-case';
import { UpdateTaskUseCase } from './application/update-task.use-case';
import { UploadAttachmentUseCase } from './application/upload-attachment.use-case';
import { Clock } from './domain/ports/clock.port';
import { FileStorage } from './domain/ports/file-storage.port';
import { TaskAccessPolicy } from './domain/ports/task-access-policy.port';
import { TaskAttachmentRepository } from './domain/ports/task-attachment-repository.port';
import { TaskRepository } from './domain/ports/task-repository.port';
import { TasksSettings } from './domain/ports/tasks-settings.port';
import { UserDirectory } from './domain/ports/user-directory.port';
import { AllowAllTaskAccessPolicy } from './infrastructure/allow-all-task-access-policy';
import { EnvTasksSettings } from './infrastructure/env-tasks-settings';
import { LocalDiskFileStorage } from './infrastructure/local-disk-file-storage';
import { SlonikTaskAttachmentRepository } from './infrastructure/slonik-task-attachment.repository';
import { SlonikTaskRepository } from './infrastructure/slonik-task.repository';
import { SlonikUserDirectory } from './infrastructure/slonik-user-directory';
import { SystemClock } from './infrastructure/system-clock';
import { TaskAttachmentsController } from './interface/http/task-attachments.controller';
import { TasksController } from './interface/http/tasks.controller';
import { registerTaskErrorStatuses } from './interface/tasks-error-status';

// Routes are protected by the global JwtAuthGuard registered in AuthModule (deny by default).
@Module({
    imports: [
        PostgresModule,
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
        EnvTasksSettings,
        { provide: TasksSettings, useExisting: EnvTasksSettings },
        { provide: TaskRepository, useClass: SlonikTaskRepository },
        { provide: TaskAttachmentRepository, useClass: SlonikTaskAttachmentRepository },
        { provide: UserDirectory, useClass: SlonikUserDirectory },
        { provide: TaskAccessPolicy, useClass: AllowAllTaskAccessPolicy },
        { provide: Clock, useClass: SystemClock },
        {
            provide: FileStorage,
            inject: [EnvTasksSettings],
            useFactory: (settings: EnvTasksSettings): FileStorage =>
                new LocalDiskFileStorage(settings.storageDir),
        },
    ],
})
export class TasksModule implements OnModuleInit {
    onModuleInit(): void {
        registerTaskErrorStatuses();
    }
}
