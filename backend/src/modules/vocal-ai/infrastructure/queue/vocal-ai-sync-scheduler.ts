import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

const SCHEDULER_ID_PREFIX = 'vocal-ai-sync';
const MINUTE_MS = 60_000;

@Injectable()
export class VocalAiSyncScheduler implements OnApplicationBootstrap {
    constructor(
        @InjectQueue(QUEUE_NAMES.VOCAL_AI_SYNC) private readonly queue: Queue,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.register();
    }

    async register(): Promise<void> {
        const projectIds = this.config.get('VOCAL_AI_PROJECT_IDS', { infer: true });
        const intervalMinutes = this.config.get('VOCAL_AI_SYNC_INTERVAL_MINUTES', { infer: true });
        const attempts = this.config.get('VOCAL_AI_SYNC_ATTEMPTS', { infer: true });
        const backoffMs = this.config.get('VOCAL_AI_SYNC_BACKOFF_MS', { infer: true });

        await this.removeStaleSchedulers(projectIds);

        for (const projectId of projectIds) {
            await this.queue.upsertJobScheduler(
                `${SCHEDULER_ID_PREFIX}:${projectId}`,
                { every: intervalMinutes * MINUTE_MS },
                {
                    name: JOB_NAMES.SYNC_PROJECT_CALLS,
                    data: { projectId },
                    opts: {
                        attempts,
                        backoff: {
                            type: 'exponential',
                            delay: backoffMs,
                        },
                    },
                },
            );
        }
    }

    /** Removes schedulers of projects no longer in `VOCAL_AI_PROJECT_IDS` so a rolled-back rollout actually stops. */
    private async removeStaleSchedulers(projectIds: readonly string[]): Promise<void> {
        const expectedIds = new Set(
            projectIds.map((projectId) => `${SCHEDULER_ID_PREFIX}:${projectId}`),
        );
        const existingSchedulers = await this.queue.getJobSchedulers();
        for (const scheduler of existingSchedulers) {
            const isOwnScheduler = scheduler.key.startsWith(`${SCHEDULER_ID_PREFIX}:`);
            if (isOwnScheduler && !expectedIds.has(scheduler.key)) {
                await this.queue.removeJobScheduler(scheduler.key);
            }
        }
    }
}
