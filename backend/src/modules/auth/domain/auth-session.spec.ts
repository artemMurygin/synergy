import { describe, expect, it } from 'vitest';
import { AuthSession } from './auth-session';
import { InvalidRefreshTokenError } from './errors';
import type { NewRefreshToken } from './refresh-token';

const t0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number): Date => new Date(t0.getTime() + ms);
const GRACE = 10_000;
const DAY = 86_400_000;

const next = (n: number, now = t0): NewRefreshToken => ({
    id: `t${String(n)}`,
    tokenHash: `h${String(n)}`,
    expiresAt: new Date(now.getTime() + 14 * DAY),
});

const session = (): AuthSession =>
    AuthSession.start({ id: 's1', userId: 'u1', now: t0, firstToken: next(1) });

describe('AuthSession.rotate', () => {
    it('rotates: marks the old token used and adds a new one', () => {
        const s = session();
        const r = s.rotate('h1', next(2, at(1000)), at(1000), GRACE);
        expect(r.kind).toBe('Rotated');
        const old = s.tokens.find((t) => t.tokenHash === 'h1');
        expect(old?.usedAt).toEqual(at(1000));
        expect(old?.replacedById).toBe('t2');
        expect(s.tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
        expect(s.activeToken()?.tokenHash).toBe('h2');
        expect(s.isRevoked()).toBe(false);
    });

    it('rejects an expired token', () => {
        const s = session();
        expect(() => s.rotate('h1', next(2), at(15 * DAY), GRACE)).toThrow(
            InvalidRefreshTokenError,
        );
    });

    it('rejects an unknown token', () => {
        const s = session();
        expect(() => s.rotate('nope', next(2), at(1000), GRACE)).toThrow(InvalidRefreshTokenError);
    });

    it('reports Race for a reused token inside the grace window, session stays alive', () => {
        const s = session();
        s.rotate('h1', next(2, at(1000)), at(1000), GRACE);
        const r = s.rotate('h1', next(3, at(5000)), at(5000), GRACE);
        expect(r.kind).toBe('Race');
        expect(s.isRevoked()).toBe(false);
        expect(s.activeToken()?.tokenHash).toBe('h2');
        expect(s.tokens).toHaveLength(2);
    });

    it('reports ReuseDetected outside the window and revokes the session with all tokens', () => {
        const s = session();
        s.rotate('h1', next(2, at(1000)), at(1000), GRACE);
        const r = s.rotate('h1', next(3, at(20_000)), at(20_000), GRACE);
        expect(r.kind).toBe('ReuseDetected');
        expect(s.isRevoked()).toBe(true);
        expect(s.activeToken()).toBeNull();
        expect(() => s.rotate('h2', next(4), at(21_000), GRACE)).toThrow(InvalidRefreshTokenError);
    });

    it('rejects a revoked session', () => {
        const s = session();
        s.revoke(at(10));
        expect(() => s.rotate('h1', next(2), at(20), GRACE)).toThrow(InvalidRefreshTokenError);
    });

    it('revoke is idempotent and keeps the first revocation time', () => {
        const s = session();
        s.revoke(at(10));
        s.revoke(at(99));
        expect(s.revokedAt).toEqual(at(10));
    });
});
