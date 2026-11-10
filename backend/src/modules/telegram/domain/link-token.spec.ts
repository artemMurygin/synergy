import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { LinkToken } from './link-token';

const NOW = new Date('2026-11-11T10:00:00Z');
const BASE64URL_32 = /^[A-Za-z0-9_-]{32}$/;

describe('LinkToken', () => {
    it('generates 32 base64url characters', () => {
        const token = LinkToken.generate(600, NOW);

        expect(token.value).toMatch(BASE64URL_32);
    });

    it('generates a different value every time', () => {
        const values = new Set(
            Array.from({ length: 50 }, () => LinkToken.generate(600, NOW).value),
        );

        expect(values.size).toBe(50);
    });

    it('expires after the ttl', () => {
        const token = LinkToken.generate(600, NOW);

        expect(token.expiresAt).toEqual(new Date(NOW.getTime() + 600_000));
    });

    it.each([0, -1, 1.5, Number.NaN])('rejects the ttl %s', (ttlSeconds) => {
        expect(() => LinkToken.generate(ttlSeconds, NOW)).toThrow(ArgumentInvalidError);
    });

    it('digests the value with sha256', () => {
        const token = LinkToken.generate(600, NOW);

        expect(token.digest()).toBe(createHash('sha256').update(token.value).digest('hex'));
        expect(token.digest()).not.toContain(token.value);
    });

    it('builds a deep link to the bot', () => {
        const token = LinkToken.generate(600, NOW);

        expect(token.deepLink('synergy_bot')).toBe(`https://t.me/synergy_bot?start=${token.value}`);
        expect(token.deepLink('@synergy_bot')).toBe(
            `https://t.me/synergy_bot?start=${token.value}`,
        );
    });

    it('rejects an empty bot username for the deep link', () => {
        expect(() => LinkToken.generate(600, NOW).deepLink(' @ ')).toThrow(ArgumentInvalidError);
    });

    describe('start parameter', () => {
        it('accepts a generated value and digests it the same way', () => {
            const token = LinkToken.generate(600, NOW);

            expect(LinkToken.isWellFormed(token.value)).toBe(true);
            expect(LinkToken.digestOf(token.value)).toBe(token.digest());
        });

        it.each([
            '',
            'short',
            'a'.repeat(31),
            'a'.repeat(33),
            `${'a'.repeat(31)}=`,
            `${'a'.repeat(31)}+`,
            `${'a'.repeat(31)}/`,
            `${'a'.repeat(31)} `,
        ])('rejects the malformed value "%s"', (startParameter) => {
            expect(LinkToken.isWellFormed(startParameter)).toBe(false);
        });
    });
});
