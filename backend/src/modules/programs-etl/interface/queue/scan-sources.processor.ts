import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import type { ScanProgramSourcesResult } from '../../application/models/sync-commands';
import type { ScanProgramSourcesUseCase } from '../../application/use-cases/scan-program-sources.use-case';
import { PROGRAMS_ETL_QUEUE_NAMES } from '../../infrastructure/queue/programs-etl-queue.constants';
import type { ScanSourcesJobData } from '../../infrastructure/queue/programs-etl-queue.dto';
import { SCAN_PROGRAM_SOURCES_USE_CASE } from '../../programs-etl.tokens';
import { mapJobError } from './programs-job-error';

@Processor(PROGRAMS_ETL_QUEUE_NAMES.SCAN)
export class ScanSourcesProcessor extends WorkerHost {
    private running = false;

    constructor(
        @Inject(SCAN_PROGRAM_SOURCES_USE_CASE) private readonly scan: ScanProgramSourcesUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(ScanSourcesProcessor.name);
    }

    async process(
        _job: Job<ScanSourcesJobData>,
    ): Promise<ScanProgramSourcesResult | { skipped: true }> {
        if (this.running) {
            this.logger.warn({ phase: 'scan', outcome: 'skipped' }, 'Previous scan still running');
            return { skipped: true };
        }
        this.running = true;
        try {
            const result = await this.scan.execute(new Date());
            this.logger.info(
                { phase: 'scan', outcome: 'success', ...result },
                'Programs scan done',
            );
            return result;
        } catch (error) {
            throw mapJobError(error, true);
        } finally {
            this.running = false;
        }
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job | undefined, err: Error): void {
        this.logger.warn({ err, jobId: job?.id, phase: 'scan', outcome: 'failure' }, 'Scan failed');
    }
}
