import type { Job } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';

export type FailedJob = Pick<Job, 'id' | 'attemptsMade' | 'opts'>;

const DEFAULT_ATTEMPTS = 1;

export function logFailedJob(
    logger: PinoLogger,
    job: FailedJob | undefined,
    err: Error,
    subject: string,
): void {
    const attemptsMade = job?.attemptsMade ?? 0;
    const attempts = job?.opts.attempts ?? DEFAULT_ATTEMPTS;
    const fields = { err, jobId: job?.id, attemptsMade, attempts };
    if (attemptsMade >= attempts) {
        logger.error(fields, `${subject} failed after all attempts`);
        return;
    }
    logger.warn(fields, `${subject} attempt failed`);
}
