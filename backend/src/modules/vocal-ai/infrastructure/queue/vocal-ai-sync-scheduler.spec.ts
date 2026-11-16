import type { ConfigService } from '@nestjs/config';
import type { JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../../../shared/config/env.schema';
import { VocalAiSyncScheduler } from './vocal-ai-sync-scheduler';
import { JOB_NAMES } from './queue.constants';

const MINUTE_MS = 60_000;

type UpsertFn = (
    id: string,
    repeat: Omit<RepeatOptions, 'key'>,
    template: { name?: string; data?: unknown; opts?: JobSchedulerTemplateOptions },
) => Promise<void>;

function createScheduler(
    overrides: {
        projectIds?: string[];
        intervalMinutes?: number;
        attempts?: number;
        backoffMs?: number;
    } = {},
): {
    scheduler: VocalAiSyncScheduler;
    upsertJobScheduler: ReturnType<typeof vi.fn<UpsertFn>>;
} {
    const values: Record<string, unknown> = {
        VOCAL_AI_PROJECT_IDS: overrides.projectIds ?? ['project-1', 'project-2'],
        VOCAL_AI_SYNC_INTERVAL_MINUTES: overrides.intervalMinutes ?? 15,
        VOCAL_AI_SYNC_ATTEMPTS: overrides.attempts ?? 4,
        VOCAL_AI_SYNC_BACKOFF_MS: overrides.backoffMs ?? 7000,
    };
    const upsertJobScheduler = vi.fn<UpsertFn>().mockResolvedValue();
    const config = { get: vi.fn((key: string) => values[key]) } as unknown as ConfigService<
        Env,
        true
    >;
    const scheduler = new VocalAiSyncScheduler({ upsertJobScheduler } as unknown as Queue, config);
    return { scheduler, upsertJobScheduler };
}

describe('VocalAiSyncScheduler', () => {
    it('registers a separate job scheduler per project id with the interval from config', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.register();

        expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
        const ids = upsertJobScheduler.mock.calls.map((call) => call[0]);
        expect(ids).toEqual(['vocal-ai-sync:project-1', 'vocal-ai-sync:project-2']);
        for (const call of upsertJobScheduler.mock.calls) {
            const [, repeat, template] = call;
            expect(repeat).toEqual({ every: 15 * MINUTE_MS });
            expect(template.name).toBe(JOB_NAMES.SYNC_PROJECT_CALLS);
        }
    });

    it('passes the projectId of each job through to the job data', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.register();

        const projectIds = upsertJobScheduler.mock.calls.map((call) => call[2].data);
        expect(projectIds).toEqual([{ projectId: 'project-1' }, { projectId: 'project-2' }]);
    });

    it('sets attempts and exponential backoff on each job template', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.register();

        for (const call of upsertJobScheduler.mock.calls) {
            const template = call[2];
            expect(template.opts?.attempts).toBe(4);
            expect(template.opts?.backoff).toEqual({ type: 'exponential', delay: 7000 });
        }
    });

    it('registers no job scheduler when the project id list is empty', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler({ projectIds: [] });

        await scheduler.register();

        expect(upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('registers idempotently under the same scheduler ids on repeated start', async () => {
        const { scheduler, upsertJobScheduler } = createScheduler();

        await scheduler.onApplicationBootstrap();
        await scheduler.onApplicationBootstrap();

        const ids = upsertJobScheduler.mock.calls.map((call) => call[0]);
        expect(ids).toEqual([
            'vocal-ai-sync:project-1',
            'vocal-ai-sync:project-2',
            'vocal-ai-sync:project-1',
            'vocal-ai-sync:project-2',
        ]);
    });
});
