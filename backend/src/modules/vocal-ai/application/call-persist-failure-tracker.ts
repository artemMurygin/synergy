import type { CallId } from '../domain/value-objects/call-id.value-object';

export const MAX_CALL_PERSIST_ATTEMPTS = 5;

export interface CallPersistFailurePartition {
    blockingCallIds: readonly CallId[];
    quarantinedCallIds: readonly CallId[];
}

/**
 * Tracks, per callId, how many consecutive sync cycles in a row failed to persist that call.
 * A call that keeps failing forever (poison data, a constraint violation that never clears)
 * would otherwise block the cursor indefinitely and make the sync window grow without bound.
 * After `MAX_CALL_PERSIST_ATTEMPTS` consecutive failures, the callId is quarantined: it stops
 * blocking the cursor so the project can keep making progress, while still being logged at
 * error level for manual investigation.
 */
export class CallPersistFailureTracker {
    private readonly attemptsByCallId = new Map<number, number>();

    partition(
        attemptedCallIds: readonly CallId[],
        failedCallIds: readonly CallId[],
    ): CallPersistFailurePartition {
        const failedIds = new Set(failedCallIds.map((callId) => callId.value));
        for (const callId of attemptedCallIds) {
            if (!failedIds.has(callId.value)) {
                this.attemptsByCallId.delete(callId.value);
            }
        }

        const blockingCallIds: CallId[] = [];
        const quarantinedCallIds: CallId[] = [];
        for (const callId of failedCallIds) {
            const attempts = (this.attemptsByCallId.get(callId.value) ?? 0) + 1;
            this.attemptsByCallId.set(callId.value, attempts);
            if (attempts >= MAX_CALL_PERSIST_ATTEMPTS) {
                quarantinedCallIds.push(callId);
            } else {
                blockingCallIds.push(callId);
            }
        }

        return { blockingCallIds, quarantinedCallIds };
    }
}
