import { Injectable, Logger } from '@nestjs/common';
import { RateLimitedError } from '../domain/errors';
import { LoginAttemptStore } from '../domain/ports/login-attempt-store.port';

export abstract class LoginThrottlerLimits {
    abstract readonly maxAttempts: number;
    abstract readonly windowMs: number;
}

export const loginSubject = (login: string): string => `login:${login.trim().toLowerCase()}`;
export const userSubject = (userId: string): string => `user:${userId}`;

/**
 * Counts an attempt before the password is checked, so a parallel burst cannot slip past the limit.
 * A successful attempt is given back with release(). If the store is down the limit is not enforced.
 */
@Injectable()
export class LoginThrottler {
    private readonly logger = new Logger(LoginThrottler.name);

    constructor(
        private readonly store: LoginAttemptStore,
        private readonly limits: LoginThrottlerLimits,
    ) {}

    async acquire(subject: string, ip: string): Promise<void> {
        let states;
        try {
            states = await Promise.all(
                this.keys(subject, ip).map((key) =>
                    this.store.increment(key, this.limits.windowMs),
                ),
            );
        } catch (error) {
            this.logger.error(`Attempt store unavailable, limit not enforced: ${String(error)}`);
            return;
        }
        const blocked = states.filter((state) => state.count > this.limits.maxAttempts);
        if (blocked.length === 0) return;
        const waitMs = Math.max(...blocked.map((state) => state.retryAfterMs));
        throw new RateLimitedError(Math.max(1, Math.ceil(waitMs / 1000)));
    }

    async release(subject: string, ip: string): Promise<void> {
        try {
            await Promise.all(this.keys(subject, ip).map((key) => this.store.decrement(key)));
        } catch (error) {
            this.logger.error(`Attempt store unavailable: ${String(error)}`);
        }
    }

    private keys(subject: string, ip: string): string[] {
        return [subject, `ip:${ip}`];
    }
}
