import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { PinoLogger } from 'nestjs-pino';
import { SyncDealsUseCase } from '../../application/use-cases/sync-deals.use-case';
import type { SyncDealsResult } from '../../application/use-cases/sync-deals.use-case';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { logFailedJob } from './log-failed-job';
import type { FailedJob } from './log-failed-job';

@Processor(QUEUE_NAMES.DEAL_SYNC)
export class DealSyncProcessor extends WorkerHost {
    constructor(
        private readonly syncDeals: SyncDealsUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(DealSyncProcessor.name);
    }

    async process(): Promise<SyncDealsResult> {
        const result = await this.syncDeals.execute(new Date());
        this.logger.info({ enqueued: result.enqueued }, 'Deal sync completed');
        return result;
    }

    @OnWorkerEvent('failed')
    onFailed(job: FailedJob | undefined, err: Error): void {
        logFailedJob(this.logger, job, err, 'Deal sync');
    }
}
