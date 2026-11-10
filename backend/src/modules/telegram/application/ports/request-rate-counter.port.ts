export interface RequestRate {
    readonly count: number;
    readonly retryAfterMs: number;
}

export abstract class RequestRateCounterPort {
    abstract increment(key: string, windowMs: number): Promise<RequestRate>;
}
