import type { ConfigService } from '@nestjs/config';
import type { JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../../shared/config/env.schema';
import { PROGRAMS_ETL_JOB_NAMES } from '../../infrastructure/queue/programs-etl-queue.constants';
import { PROGRAMS_SCAN_SCHEDULER_ID, ProgramsScanScheduler } from './programs-scan.scheduler';

type UpsertFn = (
    id: string,
    repeat: Omit<RepeatOptions, 'key'>,
    template: { name?: string; data?: unknown; opts?: JobSchedulerTemplateOptions },
) => Promise<void>;

function createScheduler(values: Record<string, unknown>): {
    scheduler: ProgramsScanScheduler;
    upsertJobScheduler: ReturnType<typeof vi.fn<UpsertFn>>;
} {
    const upsertJobScheduler = vi.fn<UpsertFn>().mockResolvedValue();
    const config = { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService<
        Env,
        true
    >;
    return {
        scheduler: new ProgramsScanScheduler({ upsertJobScheduler } as unknown as Queue, config),
        upsertJobScheduler,
    };
}

const ENABLED = {
    PROGRAMS_ETL_SCHEDULER_ENABLED: true,
    PROGRAMS_ETL_SCAN_CRON: '0 * * * *',
    PROGRAMS_ETL_ATTEMPTS: 4,
    PROGRAMS_ETL_BACKOFF_MS: 7000,
};

describe('ProgramsScanScheduler', () => {
    it('registers an hourly cron job scheduler for scan-sources', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler(ENABLED);

        await scheduler.onApplicationBootstrap();

        expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
        const [id, repeat, template] = upsertJobScheduler.mock.calls[0];
        expect(id).toBe(PROGRAMS_SCAN_SCHEDULER_ID);
        expect(repeat).toEqual({ pattern: '0 * * * *' });
        expect(template.name).toBe(PROGRAMS_ETL_JOB_NAMES.SCAN_SOURCES);
        expect(template.data).toEqual({ scheduledAt: expect.any(String) as string });
        expect(template.opts?.attempts).toBe(4);
        expect(template.opts?.backoff).toEqual({ type: 'exponential', delay: 7000 });
    });

    it('does nothing when the scheduler is disabled by configuration', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler({
            ...ENABLED,
            PROGRAMS_ETL_SCHEDULER_ENABLED: false,
        });

        await scheduler.onApplicationBootstrap();

        expect(upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('is idempotent: repeated start upserts the same scheduler id', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler(ENABLED);

        await scheduler.onApplicationBootstrap();
        await scheduler.onApplicationBootstrap();

        expect(upsertJobScheduler.mock.calls.map((c) => c[0])).toEqual([
            PROGRAMS_SCAN_SCHEDULER_ID,
            PROGRAMS_SCAN_SCHEDULER_ID,
        ]);
    });
});
