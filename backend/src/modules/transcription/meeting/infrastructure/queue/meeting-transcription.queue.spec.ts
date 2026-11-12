import type { JobsOptions, Queue } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { RequestContext } from '../../../../../shared/context/request-context';
import { MeetingTranscriptionQueue } from './meeting-transcription.queue';
import {
    MEETING_TRANSCRIPTION_JOB_NAMES,
    MEETING_TRANSCRIPTION_QUEUE_NAME,
    type MeetingTranscriptionJobData,
} from './meeting-transcription-queue.constants';

interface AddedJob {
    name: string;
    data: MeetingTranscriptionJobData;
    opts: JobsOptions;
}

/** Ведёт себя как BullMQ: при существующем `jobId` возвращает прежний job без ошибки. */
interface StoredJob {
    data: unknown;
    isFailed: () => Promise<boolean>;
}

function fakeQueue(stored = new Map<string, StoredJob>()): {
    queue: Queue;
    jobs: Map<string, AddedJob>;
    calls: AddedJob[];
} {
    const jobs = new Map<string, AddedJob>();
    const calls: AddedJob[] = [];
    const add = (
        name: string,
        data: MeetingTranscriptionJobData,
        opts: JobsOptions,
    ): Promise<{ id: string }> => {
        const job = { name, data, opts };
        calls.push(job);
        const id = opts.jobId ?? String(calls.length);
        if (!jobs.has(id)) jobs.set(id, job);
        return Promise.resolve({ id });
    };
    const getJob = (id: string): Promise<StoredJob | undefined> => Promise.resolve(stored.get(id));
    // Фейк сторонней библиотеки: реальный Queue требует Redis.
    return { queue: { add, getJob } as unknown as Queue, jobs, calls };
}

describe('MeetingTranscriptionQueue', () => {
    it('uses the meeting-transcription queue', () => {
        expect(MEETING_TRANSCRIPTION_QUEUE_NAME).toBe('meeting-transcription');
    });

    it('adds a transcribe-meeting job with the given jobId and the file id in data', async () => {
        const { queue, calls } = fakeQueue();

        await new MeetingTranscriptionQueue(queue).enqueue('file-1', 'file-1');

        expect(calls).toEqual([
            {
                name: MEETING_TRANSCRIPTION_JOB_NAMES.TRANSCRIBE,
                data: { fileId: 'file-1' },
                opts: { jobId: 'file-1' },
            },
        ]);
        expect(MEETING_TRANSCRIPTION_JOB_NAMES.TRANSCRIBE).toBe('transcribe-meeting');
    });

    it('carries the request ids of the current request in the job data', async () => {
        const { queue, calls } = fakeQueue();
        const requestIds = { requestId: 'req-1', correlationId: 'corr-1' };

        await RequestContext.run(requestIds, () =>
            new MeetingTranscriptionQueue(queue).enqueue('file-1', 'file-1-retry-1'),
        );

        expect(calls[0]?.data).toEqual({ fileId: 'file-1', requestIds });
    });

    it('finds the file of a job that failed for good, and nothing otherwise', async () => {
        const stored = new Map<string, StoredJob>([
            ['failed', { data: { fileId: 'file-1' }, isFailed: () => Promise.resolve(true) }],
            ['waiting', { data: { fileId: 'file-2' }, isFailed: () => Promise.resolve(false) }],
            ['broken', { data: { fileId: '' }, isFailed: () => Promise.resolve(true) }],
        ]);
        const adapter = new MeetingTranscriptionQueue(fakeQueue(stored).queue);

        expect(await adapter.findFailedJobFileId('failed')).toBe('file-1');
        expect(await adapter.findFailedJobFileId('waiting')).toBeNull();
        expect(await adapter.findFailedJobFileId('broken')).toBeNull();
        expect(await adapter.findFailedJobFileId('missing')).toBeNull();
    });

    it('does not throw on a duplicate jobId and keeps a single job', async () => {
        const { queue, jobs } = fakeQueue();
        const adapter = new MeetingTranscriptionQueue(queue);

        await adapter.enqueue('file-1', 'file-1');
        await expect(adapter.enqueue('file-1', 'file-1')).resolves.toBeUndefined();

        expect(jobs.size).toBe(1);
    });

    it('creates a new job for a retry jobId', async () => {
        const { queue, jobs } = fakeQueue();
        const adapter = new MeetingTranscriptionQueue(queue);

        await adapter.enqueue('file-1', 'file-1');
        await adapter.enqueue('file-1', 'file-1:1');

        expect([...jobs.keys()]).toEqual(['file-1', 'file-1:1']);
    });
});
