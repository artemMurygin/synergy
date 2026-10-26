import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestIds } from './request-id';

const UNKNOWN_ID = 'unknown';
const storage = new AsyncLocalStorage<RequestIds>();

export const RequestContext = {
    run<TResult>(ids: RequestIds, callback: () => TResult): TResult {
        return storage.run(ids, callback);
    },

    getRequestId(): string {
        return storage.getStore()?.requestId ?? UNKNOWN_ID;
    },

    getCorrelationId(): string {
        return storage.getStore()?.correlationId ?? UNKNOWN_ID;
    },
};
