import { describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { PasswordPolicy } from '../domain/password-policy';
import { EnvAuthSettings, parseTtlMs } from './env-auth-settings';
import { RandomPasswordGenerator } from './random-password-generator';
import { SystemClock } from './system-clock';

describe('SystemClock', () => {
    it('returns the current time', () => {
        expect(Math.abs(new SystemClock().now().getTime() - Date.now())).toBeLessThan(1000);
    });
});

describe('RandomPasswordGenerator', () => {
    it('generates distinct passwords that satisfy the policy', () => {
        const gen = new RandomPasswordGenerator();
        const seen = new Set<string>();
        for (let i = 0; i < 20; i += 1) {
            const p = gen.generate();
            seen.add(p);
            expect(PasswordPolicy.validate(p, Login.of('user'))).toEqual([]);
        }
        expect(seen.size).toBe(20);
    });
});

describe('parseTtlMs', () => {
    it.each([
        ['30s', 30_000],
        ['15m', 900_000],
        ['2h', 7_200_000],
        ['14d', 14 * 86_400_000],
    ])('%s -> %i', (raw, ms) => {
        expect(parseTtlMs(raw)).toBe(ms);
    });

    it('rejects an unknown format', () => {
        expect(() => parseTtlMs('14w')).toThrow();
    });
});

describe('EnvAuthSettings', () => {
    it('derives refresh ttl and grace from env', () => {
        const values: Record<string, unknown> = {
            AUTH_REFRESH_TTL: '14d',
            AUTH_REFRESH_GRACE_SECONDS: 10,
        };
        const settings = new EnvAuthSettings({ get: (k: string) => values[k] } as never);
        expect(settings.refreshTtlMs).toBe(14 * 86_400_000);
        expect(settings.refreshGraceMs).toBe(10_000);
    });
});
