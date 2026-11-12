import type { OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { UnrecoverableError, type Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../../../../shared/context/request-context';
import type { Env } from '../../../../../shared/config/env.schema';
import { FailMeetingTranscriptionUseCase } from '../../application/fail-meeting-transcription.use-case';
import { TranscribeMeetingUseCase } from '../../application/transcribe-meeting.use-case';
import { TranscriptionPermanentError } from '../../domain/errors';
import { MeetingTranscriptionQueuePort } from '../../domain/ports/meeting-transcription-queue.port';
import {
    MEETING_TRANSCRIPTION_QUEUE_NAME,
    meetingTranscriptionJobDataSchema,
} from './meeting-transcription-queue.constants';

export type ProcessableJob = Pick<Job, 'id' | 'data' | 'attemptsMade' | 'opts' | 'finishedOn'>;

const UNFINISHED_FAILURE_REASON = 'provider-unavailable';

@Processor(MEETING_TRANSCRIPTION_QUEUE_NAME)
export class MeetingTranscriptionProcessor extends WorkerHost implements OnApplicationBootstrap {
    constructor(
        private readonly transcribeMeeting: TranscribeMeetingUseCase,
        private readonly failMeetingTranscription: FailMeetingTranscriptionUseCase,
        private readonly queue: MeetingTranscriptionQueuePort,
        private readonly config: ConfigService<Env, true>,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(MeetingTranscriptionProcessor.name);
    }

    // `@Processor` принимает только статические опции, поэтому concurrency ставится после старта.
    onApplicationBootstrap(): void {
        this.worker.concurrency = this.config.get('MEETING_TRANSCRIPTION_CONCURRENCY', {
            infer: true,
        });
    }

    async process(job: ProcessableJob): Promise<void> {
        const parsed = meetingTranscriptionJobDataSchema.safeParse(job.data);
        if (!parsed.success) {
            this.logger.error({ jobId: job.id }, 'Meeting transcription job payload is invalid');
            throw new UnrecoverableError('Invalid meeting transcription job payload');
        }
        const { fileId, requestIds } = parsed.data;
        // `attemptsMade` — число уже упавших попыток, текущая в него не входит.
        const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
        const deadline = AbortSignal.timeout(
            this.config.get('MEETING_TRANSCRIPTION_JOB_TIMEOUT_MS', { infer: true }),
        );
        const run = (): Promise<void> => this.transcribe(fileId, isFinalAttempt, deadline);
        await (requestIds === undefined ? run() : RequestContext.run(requestIds, run));
    }

    // BullMQ вызывает обработчик после каждой упавшей попытки; `finishedOn` есть только у
    // окончательно упавшего job'а. Так ловятся сбои вне use case: ошибка БД, падение `persist`.
    @OnWorkerEvent('failed')
    async onFailed(job: ProcessableJob | undefined, error: Error): Promise<void> {
        this.logger.warn(
            {
                jobId: job?.id,
                attemptsMade: job?.attemptsMade ?? 0,
                attempts: job?.opts.attempts ?? 1,
                errorName: error.name,
            },
            'Meeting transcription job failed',
        );
        if (job === undefined || typeof job.finishedOn !== 'number') return;
        await this.failUnfinished(job.id, job.data);
    }

    // Job, зависший сверх `maxStalledCount` (воркер упал), BullMQ переводит в failed
    // без события `failed`: остаётся только `stalled` с его id.
    @OnWorkerEvent('stalled')
    async onStalled(jobId: string): Promise<void> {
        try {
            const fileId = await this.queue.findFailedJobFileId(jobId);
            if (fileId !== null) await this.failUnfinished(jobId, { fileId });
        } catch (error: unknown) {
            this.logger.error({ jobId, err: error }, 'Failed to inspect a stalled job');
        }
    }

    private async transcribe(
        fileId: string,
        isFinalAttempt: boolean,
        deadline: AbortSignal,
    ): Promise<void> {
        try {
            await this.transcribeMeeting.execute({ fileId, isFinalAttempt, deadline });
        } catch (error: unknown) {
            if (error instanceof TranscriptionPermanentError) {
                throw new UnrecoverableError(`Meeting transcription failed: ${error.reason}`);
            }
            throw error;
        }
    }

    private async failUnfinished(jobId: string | undefined, data: unknown): Promise<void> {
        const parsed = meetingTranscriptionJobDataSchema.safeParse(data);
        if (!parsed.success) return;
        const { fileId, requestIds } = parsed.data;
        const fail = async (): Promise<void> => {
            try {
                await this.failMeetingTranscription.execute({
                    fileId,
                    reason: UNFINISHED_FAILURE_REASON,
                });
            } catch (error: unknown) {
                this.logger.error(
                    { fileId, jobId, err: error },
                    'Failed to fail an unfinished meeting transcription',
                );
            }
        };
        await (requestIds === undefined ? fail() : RequestContext.run(requestIds, fail));
    }
}
