import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import type { DefaultJobOptions } from 'bullmq';
import type { Env } from '../../../../../shared/config/env.schema';
import { MEETING_TRANSCRIPTION_QUEUE_NAME } from './meeting-transcription-queue.constants';

const BACKOFF_DELAY_MS = 30_000;
const COMPLETED_RETENTION_COUNT = 100;
const FAILED_RETENTION_COUNT = 500;

export function meetingTranscriptionJobOptions(
    config: ConfigService<Env, true>,
): DefaultJobOptions {
    return {
        attempts: config.get('MEETING_TRANSCRIPTION_ATTEMPTS', { infer: true }),
        backoff: { type: 'exponential', delay: BACKOFF_DELAY_MS },
        removeOnComplete: COMPLETED_RETENTION_COUNT,
        removeOnFail: FAILED_RETENTION_COUNT,
    };
}

// Подключение к Redis — в общем QueueRootModule; здесь только очередь расшифровки.
@Module({
    imports: [
        BullModule.registerQueueAsync({
            name: MEETING_TRANSCRIPTION_QUEUE_NAME,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                defaultJobOptions: meetingTranscriptionJobOptions(config),
            }),
        }),
    ],
    exports: [BullModule],
})
export class MeetingTranscriptionQueueModule {}
