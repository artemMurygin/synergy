export interface AttemptState {
    /** Attempts in the current window, the one just counted included. */
    count: number;
    /** Time left until the counter resets. */
    retryAfterMs: number;
}

export abstract class LoginAttemptStore {
    /** Atomically counts one attempt; the window starts with the first one and is not extended. */
    abstract increment(key: string, windowMs: number): Promise<AttemptState>;
    /** Takes one attempt back; the counter never goes below zero. */
    abstract decrement(key: string): Promise<void>;
}
