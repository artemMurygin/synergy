import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
    SyncProjectCallsUseCase,
    type SyncResult,
} from '../../application/use-cases/sync-project-calls.use-case';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';

interface VocalAiSyncJobData {
    projectId: string;
}

type VocalAiSyncJob = Pick<Job<VocalAiSyncJobData>, 'id' | 'attemptsMade' | 'opts' | 'data'>;

const DEFAULT_ATTEMPTS = 1;

@Processor(QUEUE_NAMES.VOCAL_AI_SYNC)
export class VocalAiSyncProcessor extends WorkerHost {
    constructor(
        private readonly syncProjectCalls: SyncProjectCallsUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(VocalAiSyncProcessor.name);
    }

    async process(job: VocalAiSyncJob): Promise<SyncResult> {
        const { projectId } = job.data;
        const result = await this.syncProjectCalls.execute(projectId, new Date());
        this.logger.info(
            { projectId, syncedCallsCount: result.syncedCallsCount },
            'Vocal AI project sync completed',
        );
        return result;
    }

    @OnWorkerEvent('failed')
    onFailed(job: VocalAiSyncJob | undefined, err: Error): void {
        const attemptsMade = job?.attemptsMade ?? 0;
        const attempts = job?.opts.attempts ?? DEFAULT_ATTEMPTS;
        const projectId = job?.data.projectId;
        const fields = { err, jobId: job?.id, projectId, attemptsMade, attempts };
        if (attemptsMade >= attempts) {
            this.logger.error(fields, 'Vocal AI project sync failed after all attempts');
            return;
        }
        this.logger.warn(fields, 'Vocal AI project sync attempt failed');
    }
}
