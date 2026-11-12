import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { DownloadTokenService } from './download-token.service';

const SECRET = 'd'.repeat(40);
const MAIN_JWT_SECRET = 'm'.repeat(40);
const FILE_A = '11111111-1111-4111-8111-111111111111';
const FILE_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-12T10:00:00Z');

function service(opts: { secret?: string; now?: () => Date } = {}): DownloadTokenService {
    return new DownloadTokenService({
        secret: opts.secret ?? SECRET,
        clock: { now: opts.now ?? ((): Date => NOW) },
    });
}

describe('DownloadTokenService', () => {
    it('verifies a token for the same fileId', () => {
        const svc = service();
        const { token } = svc.sign(FILE_A, 300);
        expect(svc.verify(token, FILE_A)).toBe(true);
    });

    it('rejects a token of file A for file B', () => {
        const svc = service();
        const { token } = svc.sign(FILE_A, 300);
        expect(svc.verify(token, FILE_B)).toBe(false);
    });

    it('rejects an expired token', () => {
        const { token } = service().sign(FILE_A, 300);
        const later = service({ now: () => new Date(NOW.getTime() + 301_000) });
        expect(later.verify(token, FILE_A)).toBe(false);
    });

    it('accepts a token just before expiry', () => {
        const { token } = service().sign(FILE_A, 300);
        const later = service({ now: () => new Date(NOW.getTime() + 299_000) });
        expect(later.verify(token, FILE_A)).toBe(true);
    });

    it('rejects a token signed with the main JWT_SECRET', () => {
        const forged = new JwtService({ secret: MAIN_JWT_SECRET }).sign(
            { sub: FILE_A, aud: 'file-download', exp: Math.floor(NOW.getTime() / 1000) + 300 },
            { algorithm: 'HS256' },
        );
        expect(service().verify(forged, FILE_A)).toBe(false);
        const own = service({ secret: MAIN_JWT_SECRET }).sign(FILE_A, 300).token;
        expect(service().verify(own, FILE_A)).toBe(false);
    });

    it('rejects a token with another aud', () => {
        const other = new JwtService({ secret: SECRET }).sign(
            { sub: FILE_A, aud: 'access', exp: Math.floor(NOW.getTime() / 1000) + 300 },
            { algorithm: 'HS256' },
        );
        expect(service().verify(other, FILE_A)).toBe(false);
    });

    it('rejects garbage and alg=none tokens', () => {
        const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
            JSON.stringify({ sub: FILE_A, aud: 'file-download', exp: 9999999999 }),
        ).toString('base64url')}.`;
        expect(service().verify('garbage', FILE_A)).toBe(false);
        expect(service().verify(none, FILE_A)).toBe(false);
    });

    it('sets expiresAt to now + TTL', () => {
        const { expiresAt } = service().sign(FILE_A, 300);
        expect(expiresAt.toISOString()).toBe(new Date(NOW.getTime() + 300_000).toISOString());
    });
});
