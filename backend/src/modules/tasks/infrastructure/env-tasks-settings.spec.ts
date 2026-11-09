import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { EnvTasksSettings } from './env-tasks-settings';

function config(values: Record<string, unknown>): ConfigService<never, true> {
    return { get: (key: string) => values[key] } as unknown as ConfigService<never, true>;
}

describe('EnvTasksSettings', () => {
    it('converts megabytes to bytes and exposes limits and directory', () => {
        const settings = new EnvTasksSettings(
            config({
                TASKS_MAX_FILE_SIZE_MB: 20,
                TASKS_MAX_FILES_PER_TASK: 10,
                TASKS_STORAGE_DIR: './s',
            }),
        );

        expect(settings.maxFileSizeBytes).toBe(20 * 1024 * 1024);
        expect(settings.maxFilesPerTask).toBe(10);
        expect(settings.storageDir).toBe('./s');
    });
});
