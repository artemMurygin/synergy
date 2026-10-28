import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

const SCHEDULER_ID = 'deal-sync';
const MINUTE_MS = 60_000;

@Injectable()
export class DealSyncScheduler implements OnApplicationBootstrap {
    constructor(
        @InjectQueue(QUEUE_NAMES.DEAL_SYNC) private readonly queue: Queue,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.register();
    }

    async register(): Promise<void> {
        const intervalMinutes = this.config.get('DEAL_SYNC_INTERVAL_MINUTES', { infer: true });
        await this.queue.upsertJobScheduler(
            SCHEDULER_ID,
            { every: intervalMinutes * MINUTE_MS },
            {
                name: JOB_NAMES.SYNC_DEALS,
                data: {},
                opts: {
                    attempts: this.config.get('DEAL_SYNC_ATTEMPTS', { infer: true }),
                    backoff: {
                        type: 'exponential',
                        delay: this.config.get('DEAL_SYNC_BACKOFF_MS', { infer: true }),
                    },
                },
            },
        );
    }
}
