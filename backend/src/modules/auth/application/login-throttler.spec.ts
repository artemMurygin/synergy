import { describe, expect, it, vi } from 'vitest';
import { RateLimitedError } from '../domain/errors';
import type { LoginAttemptStore } from '../domain/ports/login-attempt-store.port';
import { InMemoryLoginAttemptStore } from '../interface/http/testing/in-memory-login-attempt-store';
import { LoginThrottler, loginSubject, userSubject } from './login-throttler';

function setup(store?: LoginAttemptStore): {
    throttler: LoginThrottler;
    advance: (ms: number) => void;
} {
    let now = 1_000_000;
    const throttler = new LoginThrottler(store ?? new InMemoryLoginAttemptStore(() => now), {
        maxAttempts: 2,
        windowMs: 60_000,
    });
    return {
        throttler,
        advance: (ms): void => {
            now += ms;
        },
    };
}

const anna = loginSubject('anna');

describe('LoginThrottler', () => {
    it('lets attempts through until the limit and blocks the next one', async () => {
        const { throttler } = setup();
        await expect(throttler.acquire(anna, '1.1.1.1')).resolves.toBeUndefined();
        await expect(throttler.acquire(anna, '1.1.1.1')).resolves.toBeUndefined();
        await expect(throttler.acquire(anna, '1.1.1.1')).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('lets only maxAttempts of a parallel burst reach the password check', async () => {
        const { throttler } = setup();
        const results = await Promise.allSettled(
            Array.from({ length: 50 }, () => throttler.acquire(anna, '1.1.1.1')),
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    });

    it('limits a login regardless of the client address', async () => {
        const { throttler } = setup();
        await throttler.acquire(anna, '1.1.1.1');
        await throttler.acquire(anna, '2.2.2.2');
        await expect(throttler.acquire(anna, '3.3.3.3')).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('limits an address regardless of the login', async () => {
        const { throttler } = setup();
        await throttler.acquire(loginSubject('a'), '1.1.1.1');
        await throttler.acquire(loginSubject('b'), '1.1.1.1');
        await expect(throttler.acquire(loginSubject('c'), '1.1.1.1')).rejects.toBeInstanceOf(
            RateLimitedError,
        );
        await expect(throttler.acquire(loginSubject('c'), '9.9.9.9')).resolves.toBeUndefined();
    });

    it('normalises the login the way Login does', async () => {
        const { throttler } = setup();
        await throttler.acquire(loginSubject(' Anna '), '1.1.1.1');
        await throttler.acquire(loginSubject('ANNA'), '2.2.2.2');
        await expect(throttler.acquire(anna, '3.3.3.3')).rejects.toBeInstanceOf(RateLimitedError);
    });

    it('keeps a login and a user id apart', async () => {
        const { throttler } = setup();
        await throttler.acquire(loginSubject('u1'), '1.1.1.1');
        await throttler.acquire(loginSubject('u1'), '2.2.2.2');
        await expect(throttler.acquire(userSubject('u1'), '3.3.3.3')).resolves.toBeUndefined();
    });

    it('does not count an attempt that was released after a success', async () => {
        const { throttler } = setup();
        for (let i = 0; i < 5; i += 1) {
            await throttler.acquire(anna, '1.1.1.1');
            await throttler.release(anna, '1.1.1.1');
        }
        await expect(throttler.acquire(anna, '1.1.1.1')).resolves.toBeUndefined();
    });

    it('reports the remaining wait in whole seconds and lets the client in afterwards', async () => {
        const { throttler, advance } = setup();
        await throttler.acquire(anna, '1.1.1.1');
        await throttler.acquire(anna, '1.1.1.1');
        advance(30_500);
        const error = await throttler.acquire(anna, '1.1.1.1').catch((e: unknown) => e);
        expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });
        advance(30_000);
        await expect(throttler.acquire(anna, '1.1.1.1')).resolves.toBeUndefined();
    });

    it('fails open when the store is down', async () => {
        const broken = {
            increment: vi.fn().mockRejectedValue(new Error('redis down')),
            decrement: vi.fn().mockRejectedValue(new Error('redis down')),
        } as unknown as LoginAttemptStore;
        const { throttler } = setup(broken);
        await expect(throttler.acquire(anna, '1.1.1.1')).resolves.toBeUndefined();
        await expect(throttler.release(anna, '1.1.1.1')).resolves.toBeUndefined();
    });
});
