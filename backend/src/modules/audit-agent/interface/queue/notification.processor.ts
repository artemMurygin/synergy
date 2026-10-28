import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../../../shared/context/request-context';
import { DeliverNotificationUseCase } from '../../application/use-cases/deliver-notification.use-case';
import { NotificationJob } from '../../domain/value-objects/notification-job.value-object';
import { PermanentNotifyError } from '../../domain/errors/notify.errors';
import { notificationJobDataSchema } from '../../infrastructure/queue/queue-job-data';
import type { NotificationJobData } from '../../infrastructure/queue/queue-job-data';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { logFailedJob } from './log-failed-job';
import type { FailedJob } from './log-failed-job';

@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
    constructor(
        private readonly deliverNotification: DeliverNotificationUseCase,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(NotificationProcessor.name);
    }

    async process(job: Job<NotificationJobData>): Promise<void> {
        const parsed = notificationJobDataSchema.safeParse(job.data);
        if (!parsed.success) {
            this.logger.error({ jobId: job.id }, 'Notification job payload is invalid');
            throw new UnrecoverableError('Invalid notification job payload');
        }
        const { username, message, requestIds } = parsed.data;
        const execute = (): Promise<void> =>
            this.run(job, new NotificationJob({ username, message }));
        await (requestIds === undefined ? execute() : RequestContext.run(requestIds, execute));
    }

    @OnWorkerEvent('failed')
    onFailed(job: FailedJob | undefined, err: Error): void {
        logFailedJob(this.logger, job, err, 'Notification');
    }

    private async run(job: Job<NotificationJobData>, notification: NotificationJob): Promise<void> {
        try {
            await this.deliverNotification.execute(notification);
        } catch (err: unknown) {
            if (err instanceof PermanentNotifyError) {
                this.logger.error(
                    { err, jobId: job.id },
                    'Notification delivery failed permanently',
                );
                throw new UnrecoverableError(err.message);
            }
            throw err;
        }
    }
}
