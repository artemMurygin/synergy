import { describe, expect, it } from 'vitest';
import { JwtAccessTokenService } from '../../auth/infrastructure/jwt-access-token.service';
import { ConnectionRejectedError } from '../application/ports/connection-authenticator.port';
import { ConnectionAuthenticator } from './connection-authenticator';

const SECRET = 's'.repeat(40);
const TTL_SECONDS = 900;
const USER_ID = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const ISSUED_AT = new Date('2026-11-06T10:00:00.000Z');

function tokenService(now: Date, secret = SECRET): JwtAccessTokenService {
    return new JwtAccessTokenService({
        secret,
        ttlSeconds: TTL_SECONDS,
        clock: { now: () => now },
    });
}

function sign(
    options: { mustChangePassword?: boolean; issuedAt?: Date; secret?: string } = {},
): string {
    return tokenService(options.issuedAt ?? new Date(), options.secret).sign({
        sub: USER_ID,
        sid: 'session-1',
        mcp: options.mustChangePassword ?? false,
    }).token;
}

function rejectionOf(work: () => unknown): string {
    try {
        work();
    } catch (error: unknown) {
        if (error instanceof ConnectionRejectedError) return error.reason;
        throw error;
    }
    throw new Error('Expected the connection to be rejected');
}

describe('ConnectionAuthenticator', () => {
    const authenticator = new ConnectionAuthenticator(tokenService(new Date()));

    it('returns the user id and the token expiry for a valid token', () => {
        const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
        const token = sign({ issuedAt });

        expect(authenticator.authenticate(token)).toEqual({
            userId: USER_ID,
            expiresAt: new Date(issuedAt.getTime() + TTL_SECONDS * 1000),
        });
    });

    it('rejects an expired token with token_expired', () => {
        const token = sign({ issuedAt: ISSUED_AT });

        expect(rejectionOf(() => authenticator.authenticate(token))).toBe('token_expired');
    });

    it.each([
        ['an empty token', ''],
        ['garbage', 'not-a-jwt'],
        ['a token signed with another secret', sign({ secret: 'x'.repeat(40) })],
    ])('rejects %s with token_invalid', (_case, token) => {
        expect(rejectionOf(() => authenticator.authenticate(token))).toBe('token_invalid');
    });

    it('rejects a user who must change the temporary password', () => {
        const token = sign({ mustChangePassword: true });

        expect(rejectionOf(() => authenticator.authenticate(token))).toBe(
            'password_change_required',
        );
    });
});
