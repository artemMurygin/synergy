import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FILES_QUEUE_NAMES } from './files-queue.constants';

const COMPLETED_RETENTION_COUNT = 30;
const FAILED_RETENTION_COUNT = 100;

// Подключение к Redis — в общем QueueRootModule; здесь только очередь модуля.
@Module({
    imports: [
        BullModule.registerQueueAsync({
            name: FILES_QUEUE_NAMES.MAINTENANCE,
            useFactory: () => ({
                defaultJobOptions: {
                    removeOnComplete: COMPLETED_RETENTION_COUNT,
                    removeOnFail: FAILED_RETENTION_COUNT,
                },
            }),
        }),
    ],
    exports: [BullModule],
})
export class FilesMaintenanceQueueModule {}
