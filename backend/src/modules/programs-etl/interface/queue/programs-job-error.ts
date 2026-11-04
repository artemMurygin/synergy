import { UnrecoverableError } from 'bullmq';
import { ProgramsSyncError } from '../../application/errors/programs-sync.error';

/**
 * Retryable `ProgramsSyncError` goes back to BullMQ as is (bounded attempts with backoff);
 * permanent ones stop retries immediately. Unknown errors follow `unknownIsRetryable`.
 */
export function mapJobError(error: unknown, unknownIsRetryable: boolean): unknown {
    const retryable = error instanceof ProgramsSyncError ? error.retryable : unknownIsRetryable;
    if (retryable) return error;
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new UnrecoverableError(message);
}
