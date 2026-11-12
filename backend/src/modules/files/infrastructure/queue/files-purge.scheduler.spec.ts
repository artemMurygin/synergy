import { ConfigService } from '@nestjs/config';
import type { JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../../shared/config/env.schema';
import { FILES_JOB_NAMES } from './files-queue.constants';
import { FilesPurgeScheduler } from './files-purge.scheduler';

type UpsertFn = (
    id: string,
    repeat: Omit<RepeatOptions, 'key'>,
    template: { name?: string; data?: unknown; opts?: JobSchedulerTemplateOptions },
) => Promise<void>;

function createScheduler(cron = '0 3 * * *'): {
    scheduler: FilesPurgeScheduler;
    upsertJobScheduler: ReturnType<typeof vi.fn<UpsertFn>>;
} {
    const upsertJobScheduler = vi.fn<UpsertFn>().mockResolvedValue();
    const config = new ConfigService<Env, true>({ FILES_PURGE_CRON: cron });
    // Фейк сторонней библиотеки: реальный Queue требует Redis.
    const scheduler = new FilesPurgeScheduler({ upsertJobScheduler } as unknown as Queue, config);
    return { scheduler, upsertJobScheduler };
}

describe('FilesPurgeScheduler', () => {
    it('upserts the files-purge scheduler with the cron from config in Moscow time', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler('30 4 * * *');

        await scheduler.onApplicationBootstrap();

        expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
        const [id, repeat, template] = upsertJobScheduler.mock.calls[0];
        expect(id).toBe('files-purge');
        expect(repeat).toEqual({ pattern: '30 4 * * *', tz: 'Europe/Moscow' });
        expect(template.name).toBe(FILES_JOB_NAMES.PURGE_EXPIRED);
    });

    it('registers under the same id on every start', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.onApplicationBootstrap();
        await scheduler.onApplicationBootstrap();

        expect(upsertJobScheduler.mock.calls.map((call) => call[0])).toEqual([
            'files-purge',
            'files-purge',
        ]);
    });
});
