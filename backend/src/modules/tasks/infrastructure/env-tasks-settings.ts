import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../shared/config/env.schema';
import { TasksSettings } from '../domain/ports/tasks-settings.port';

const BYTES_IN_MB = 1024 * 1024;

@Injectable()
export class EnvTasksSettings extends TasksSettings {
    readonly maxFileSizeBytes: number;
    readonly maxFilesPerTask: number;
    readonly storageDir: string;

    constructor(config: ConfigService<Env, true>) {
        super();
        this.maxFileSizeBytes = config.get('TASKS_MAX_FILE_SIZE_MB', { infer: true }) * BYTES_IN_MB;
        this.maxFilesPerTask = config.get('TASKS_MAX_FILES_PER_TASK', { infer: true });
        this.storageDir = config.get('TASKS_STORAGE_DIR', { infer: true });
    }
}
