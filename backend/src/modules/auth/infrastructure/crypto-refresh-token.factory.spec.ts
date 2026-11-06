import { describe, expect, it } from 'vitest';
import { CryptoRefreshTokenFactory } from './crypto-refresh-token.factory';

describe('CryptoRefreshTokenFactory', () => {
    const factory = new CryptoRefreshTokenFactory();
    const expiresAt = new Date('2026-02-01T00:00:00Z');

    it('issues a 256-bit secret with a matching hash', () => {
        const issued = factory.issue(expiresAt);
        expect(Buffer.from(issued.secret, 'base64url')).toHaveLength(32);
        expect(issued.token.tokenHash).toBe(factory.hash(issued.secret));
        expect(issued.token.expiresAt).toBe(expiresAt);
        expect(issued.token.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('issues distinct secrets and ids', () => {
        const a = factory.issue(expiresAt);
        const b = factory.issue(expiresAt);
        expect(a.secret).not.toBe(b.secret);
        expect(a.token.id).not.toBe(b.token.id);
    });

    it('hashes deterministically to a hex sha-256', () => {
        expect(factory.hash('x')).toBe(factory.hash('x'));
        expect(factory.hash('x')).toMatch(/^[0-9a-f]{64}$/);
        expect(factory.hash('x')).not.toBe(factory.hash('y'));
    });
});
