import { BaseError } from '../../../shared/errors';

/** The chat has an active run: a system message waits for it to end and is retried later. */
export class RunInProgressError extends BaseError {
    readonly code = 'CHAT_RUN_IN_PROGRESS';

    constructor(readonly sessionId: string) {
        super(`Chat ${sessionId} has an active run`);
    }
}
