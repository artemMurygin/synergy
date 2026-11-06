import { describe, expect, it } from 'vitest';
import { AccessTokenExpiredError, AccessTokenInvalidError } from '../domain/errors';
import { JwtAccessTokenService } from './jwt-access-token.service';

const SECRET = 'a'.repeat(40);
const claims = { sub: 'u1', sid: 's1', mcp: true };

function service(
    opts: { secret?: string; ttlSeconds?: number; now?: () => Date } = {},
): JwtAccessTokenService {
    return new JwtAccessTokenService({
        secret: opts.secret ?? SECRET,
        ttlSeconds: opts.ttlSeconds ?? 900,
        clock: { now: opts.now ?? ((): Date => new Date()) },
    });
}

describe('JwtAccessTokenService', () => {
    it('signs and verifies claims, filling jti and exp', () => {
        const svc = service();
        const { token, expiresIn } = svc.sign(claims);
        const verified = svc.verify(token);
        expect(expiresIn).toBe(900);
        expect(verified).toMatchObject(claims);
        expect(verified.jti).toMatch(/[0-9a-f-]{36}/);
        expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('issues a unique jti per token', () => {
        const svc = service();
        expect(svc.verify(svc.sign(claims).token).jti).not.toBe(
            svc.verify(svc.sign(claims).token).jti,
        );
    });

    it('reports an expired token as AccessTokenExpiredError', () => {
        const signer = service({ ttlSeconds: 60, now: () => new Date('2020-01-01T00:00:00Z') });
        const { token } = signer.sign(claims);
        expect(() => service().verify(token)).toThrow(AccessTokenExpiredError);
    });

    it('rejects a token signed with another key', () => {
        const { token } = service({ secret: 'b'.repeat(40) }).sign(claims);
        expect(() => service().verify(token)).toThrow(AccessTokenInvalidError);
    });

    it('rejects garbage and alg=none tokens', () => {
        const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
            JSON.stringify({ ...claims, jti: 'x', exp: 9999999999 }),
        ).toString('base64url')}.`;
        expect(() => service().verify('garbage')).toThrow(AccessTokenInvalidError);
        expect(() => service().verify(none)).toThrow(AccessTokenInvalidError);
    });
});
