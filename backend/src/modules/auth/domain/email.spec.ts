import { describe, expect, it } from 'vitest';
import { Email, InvalidEmailError, MAX_EMAIL_LENGTH } from './email';

describe('Email', () => {
    it('trims and lower-cases', () => {
        expect(Email.of('  Ivan.Petrov@Example.COM ').value).toBe('ivan.petrov@example.com');
    });

    it('rejects a malformed address', () => {
        for (const bad of ['', 'plain', 'a@', '@b.ru', 'a b@c.ru', 'a@b', 'a@@b.ru']) {
            expect(() => Email.of(bad), bad).toThrow(InvalidEmailError);
        }
    });

    it('limits the length to 254 characters', () => {
        expect(MAX_EMAIL_LENGTH).toBe(254);
        const ok = `${'a'.repeat(MAX_EMAIL_LENGTH - '@example.com'.length)}@example.com`;
        expect(ok).toHaveLength(254);
        expect(Email.of(ok).value).toBe(ok);
        expect(() => Email.of(`a${ok}`)).toThrow(InvalidEmailError);
    });

    it('optional: an empty or missing value means no email', () => {
        expect(Email.optional('')).toBeUndefined();
        expect(Email.optional('   ')).toBeUndefined();
        expect(Email.optional(null)).toBeUndefined();
        expect(Email.optional(undefined)).toBeUndefined();
        expect(Email.optional(' A@B.ru ')?.value).toBe('a@b.ru');
        expect(() => Email.optional('nope')).toThrow(InvalidEmailError);
    });

    it('compares by value', () => {
        expect(Email.of('A@b.ru').equals(Email.of('a@B.ru'))).toBe(true);
        expect(Email.of('a@b.ru').equals(Email.of('c@b.ru'))).toBe(false);
    });
});
