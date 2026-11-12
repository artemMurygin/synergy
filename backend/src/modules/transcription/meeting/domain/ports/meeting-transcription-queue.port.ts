export abstract class MeetingTranscriptionQueuePort {
    /** Дубль по `jobId` молча игнорируется. */
    abstract enqueue(fileId: string, jobId: string): Promise<void>;
    /** `fileId` job'а, который окончательно упал; `null`, если job ещё жив или его нет. */
    abstract findFailedJobFileId(jobId: string): Promise<string | null>;
}
