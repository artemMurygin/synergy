import type { ConfigService } from '@nestjs/config';
import type { JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../../shared/config/env.schema';
import { DealSyncScheduler } from './deal-sync-scheduler';
import { JOB_NAMES } from './queue.constants';

const MINUTE_MS = 60_000;

type UpsertFn = (
    id: string,
    repeat: Omit<RepeatOptions, 'key'>,
    template: { name?: string; data?: unknown; opts?: JobSchedulerTemplateOptions },
) => Promise<void>;

function createScheduler(overrides: Partial<Record<string, number>> = {}): {
    scheduler: DealSyncScheduler;
    upsertJobScheduler: ReturnType<typeof vi.fn<UpsertFn>>;
} {
    const values: Record<string, number> = {
        DEAL_SYNC_INTERVAL_MINUTES: 15,
        DEAL_SYNC_ATTEMPTS: 4,
        DEAL_SYNC_BACKOFF_MS: 7000,
        ...overrides,
    };
    const upsertJobScheduler = vi.fn<UpsertFn>().mockResolvedValue();
    const config = { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService<
        Env,
        true
    >;
    const scheduler = new DealSyncScheduler({ upsertJobScheduler } as unknown as Queue, config);
    return { scheduler, upsertJobScheduler };
}

describe('DealSyncScheduler', () => {
    it('upserts the scheduler with the interval from config', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.register();

        expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
        const [id, repeat, template] = upsertJobScheduler.mock.calls[0];
        expect(id).toBe('deal-sync');
        expect(repeat).toEqual({ every: 15 * MINUTE_MS });
        expect(template.name).toBe(JOB_NAMES.SYNC_DEALS);
    });

    it('sets attempts and exponential backoff on the job template', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.register();

        const template = upsertJobScheduler.mock.calls[0][2];
        expect(template.opts?.attempts).toBe(4);
        expect(template.opts?.backoff).toEqual({ type: 'exponential', delay: 7000 });
    });

    it('registers idempotently under the same scheduler id on repeated start', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.onApplicationBootstrap();
        await scheduler.onApplicationBootstrap();

        const ids = upsertJobScheduler.mock.calls.map((call) => call[0]);
        expect(ids).toEqual(['deal-sync', 'deal-sync']);
    });
});
