import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
    PurgeExpiredFilesUseCase,
    type PurgeExpiredFilesResult,
} from '../../application/purge-expired-files.use-case';
import { FILES_QUEUE_NAMES } from './files-queue.constants';

@Processor(FILES_QUEUE_NAMES.MAINTENANCE)
export class FilesPurgeProcessor extends WorkerHost {
    constructor(
        private readonly purgeExpiredFiles: PurgeExpiredFilesUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(FilesPurgeProcessor.name);
    }

    async process(): Promise<PurgeExpiredFilesResult> {
        const result = await this.purgeExpiredFiles.execute(new Date());
        this.logger.info(
            { deletedCount: result.deleted, failedCount: result.failed },
            'Expired files purged',
        );
        return result;
    }

    @OnWorkerEvent('failed')
    onFailed(_job: unknown, error: Error): void {
        this.logger.error({ err: error }, 'Files purge failed');
    }
}
