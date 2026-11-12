import { MeetingTranscriptionQueuePort } from '../domain/ports/meeting-transcription-queue.port';

/** Как BullMQ: повторный `jobId` не создаёт второй job. */
export class FakeMeetingTranscriptionQueue extends MeetingTranscriptionQueuePort {
    readonly jobs = new Map<string, { fileId: string }>();

    /** `jobId → fileId` окончательно упавших job'ов. */
    readonly failedJobs = new Map<string, string>();

    enqueue(fileId: string, jobId: string): Promise<void> {
        if (!this.jobs.has(jobId)) this.jobs.set(jobId, { fileId });
        return Promise.resolve();
    }

    findFailedJobFileId(jobId: string): Promise<string | null> {
        return Promise.resolve(this.failedJobs.get(jobId) ?? null);
    }
}
