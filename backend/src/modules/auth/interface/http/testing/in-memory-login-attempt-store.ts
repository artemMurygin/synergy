import {
    type AttemptState,
    LoginAttemptStore,
} from '../../../domain/ports/login-attempt-store.port';

export class InMemoryLoginAttemptStore extends LoginAttemptStore {
    private readonly entries = new Map<string, { count: number; expiresAt: number }>();

    constructor(private readonly now: () => number = Date.now) {
        super();
    }

    reset(): void {
        this.entries.clear();
    }

    increment(key: string, windowMs: number): Promise<AttemptState> {
        let entry = this.entries.get(key);
        if (entry === undefined || entry.expiresAt <= this.now()) {
            entry = { count: 0, expiresAt: this.now() + windowMs };
            this.entries.set(key, entry);
        }
        entry.count += 1;
        return Promise.resolve({ count: entry.count, retryAfterMs: entry.expiresAt - this.now() });
    }

    decrement(key: string): Promise<void> {
        const entry = this.entries.get(key);
        if (entry === undefined) return Promise.resolve();
        entry.count -= 1;
        if (entry.count <= 0) this.entries.delete(key);
        return Promise.resolve();
    }
}
