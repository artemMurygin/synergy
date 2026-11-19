import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { TaskAttachmentLinksUnavailableError } from '../../domain/errors';
import {
    createAttachmentDownloadToken,
    JwtAttachmentDownloadToken,
} from './attachment-download-token.service';

const SECRET = 'd'.repeat(40);
const ATT_A = '11111111-1111-4111-8111-111111111111';
const ATT_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-12T10:00:00Z');

function service(opts: { secret?: string; now?: () => Date } = {}): JwtAttachmentDownloadToken {
    return new JwtAttachmentDownloadToken({
        secret: opts.secret ?? SECRET,
        clock: { now: opts.now ?? ((): Date => NOW) },
    });
}

describe('JwtAttachmentDownloadToken', () => {
    it('signs with aud task-attachment and the given ttl', () => {
        const { token, expiresAt } = service().sign(ATT_A, 300);
        const payload = new JwtService({ secret: SECRET }).decode<{
            aud: string;
            sub: string;
            exp: number;
        }>(token);
        expect(payload.aud).toBe('task-attachment');
        expect(payload.sub).toBe(ATT_A);
        expect(payload.exp).toBe(Math.floor(NOW.getTime() / 1000) + 300);
        expect(expiresAt).toEqual(new Date(NOW.getTime() + 300_000));
    });

    it('verifies a token for the same attachment', () => {
        const svc = service();
        expect(svc.verify(svc.sign(ATT_A, 300).token, ATT_A)).toBe(true);
    });

    it('rejects a token of another attachment', () => {
        const svc = service();
        expect(svc.verify(svc.sign(ATT_A, 300).token, ATT_B)).toBe(false);
    });

    it('rejects an expired token', () => {
        const { token } = service().sign(ATT_A, 300);
        const later = service({ now: () => new Date(NOW.getTime() + 301_000) });
        expect(later.verify(token, ATT_A)).toBe(false);
    });

    it('rejects a forged token and garbage', () => {
        const forged = service({ secret: 'x'.repeat(40) }).sign(ATT_A, 300).token;
        expect(service().verify(forged, ATT_A)).toBe(false);
        expect(service().verify('garbage', ATT_A)).toBe(false);
        expect(service().verify('', ATT_A)).toBe(false);
    });

    it('rejects a chat file token (aud file-download) signed with the same secret', () => {
        const chatToken = new JwtService({ secret: SECRET }).sign(
            { sub: ATT_A, aud: 'file-download', exp: Math.floor(NOW.getTime() / 1000) + 300 },
            { algorithm: 'HS256' },
        );
        expect(service().verify(chatToken, ATT_A)).toBe(false);
    });
});

describe('createAttachmentDownloadToken', () => {
    it('without a secret reports links as unavailable', () => {
        const svc = createAttachmentDownloadToken(undefined, { now: () => NOW });
        expect(() => svc.sign(ATT_A, 300)).toThrow(TaskAttachmentLinksUnavailableError);
        expect(svc.verify('any', ATT_A)).toBe(false);
    });

    it('with a secret returns a working adapter', () => {
        const svc = createAttachmentDownloadToken(SECRET, { now: () => NOW });
        expect(svc.verify(svc.sign(ATT_A, 60).token, ATT_A)).toBe(true);
    });
});
