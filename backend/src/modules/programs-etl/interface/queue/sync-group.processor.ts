import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { ProgramsSyncResult } from '../../application/models/sync-commands';
import type { SyncProgramsGroupUseCase } from '../../application/use-cases/sync-programs-group.use-case';
import { PROGRAMS_ETL_QUEUE_NAMES } from '../../infrastructure/queue/programs-etl-queue.constants';
import type { SyncGroupJobData } from '../../infrastructure/queue/programs-etl-queue.dto';
import { SYNC_PROGRAMS_GROUP_USE_CASE } from '../../programs-etl.tokens';
import { mapJobError } from './programs-job-error';

@Processor(PROGRAMS_ETL_QUEUE_NAMES.SYNC)
export class SyncGroupProcessor extends WorkerHost {
    constructor(
        @Inject(SYNC_PROGRAMS_GROUP_USE_CASE) private readonly sync: SyncProgramsGroupUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(SyncGroupProcessor.name);
    }

    async process(job: Job<SyncGroupJobData>): Promise<ProgramsSyncResult> {
        const { runId, groupId, changedSources, previousRunId } = job.data;
        const attempts = job.opts.attempts ?? 1;
        const willRetry = job.attemptsMade + 1 < attempts;
        try {
            return await this.sync.execute({
                runId,
                groupId,
                trigger: previousRunId === undefined ? 'scheduled' : 'retry',
                changedSources: changedSources.map((s) => ({
                    sourceId: s.sourceId,
                    observedHash: s.observedHash,
                })),
                ...(willRetry ? { finalAttempt: false } : {}),
            });
        } catch (error) {
            throw mapJobError(error, false);
        }
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job<SyncGroupJobData> | undefined, err: Error): void {
        this.logger.warn(
            {
                err,
                jobId: job?.id,
                run_id: job?.data.runId,
                group_id: job?.data.groupId,
                phase: 'sync',
                outcome: 'failure',
            },
            'Group sync job failed',
        );
    }
}
