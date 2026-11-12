import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Env } from '../../../../shared/config/env.schema';
import { FILES_JOB_NAMES, FILES_QUEUE_NAMES } from './files-queue.constants';

const SCHEDULER_ID = 'files-purge';
const TIME_ZONE = 'Europe/Moscow';

/** Ежедневная очистка; job scheduler даёт один job на тик на весь кластер. */
@Injectable()
export class FilesPurgeScheduler implements OnApplicationBootstrap {
    constructor(
        @InjectQueue(FILES_QUEUE_NAMES.MAINTENANCE) private readonly queue: Queue,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.queue.upsertJobScheduler(
            SCHEDULER_ID,
            { pattern: this.config.get('FILES_PURGE_CRON', { infer: true }), tz: TIME_ZONE },
            { name: FILES_JOB_NAMES.PURGE_EXPIRED, data: {} },
        );
    }
}
