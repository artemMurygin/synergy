import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { RequestContext } from '../../../../../shared/context/request-context';
import { MeetingTranscriptionQueuePort } from '../../domain/ports/meeting-transcription-queue.port';
import {
    MEETING_TRANSCRIPTION_JOB_NAMES,
    MEETING_TRANSCRIPTION_QUEUE_NAME,
    meetingTranscriptionJobDataSchema,
    type MeetingTranscriptionJobData,
} from './meeting-transcription-queue.constants';

@Injectable()
export class MeetingTranscriptionQueue extends MeetingTranscriptionQueuePort {
    constructor(@InjectQueue(MEETING_TRANSCRIPTION_QUEUE_NAME) private readonly queue: Queue) {
        super();
    }

    // BullMQ при существующем `jobId` возвращает прежний job, ошибки нет.
    async enqueue(fileId: string, jobId: string): Promise<void> {
        const data: MeetingTranscriptionJobData = { fileId, requestIds: RequestContext.getIds() };
        await this.queue.add(MEETING_TRANSCRIPTION_JOB_NAMES.TRANSCRIBE, data, { jobId });
    }

    async findFailedJobFileId(jobId: string): Promise<string | null> {
        const job = await this.queue.getJob(jobId);
        if (job === undefined || !(await job.isFailed())) return null;
        const parsed = meetingTranscriptionJobDataSchema.safeParse(job.data);
        return parsed.success ? parsed.data.fileId : null;
    }
}
