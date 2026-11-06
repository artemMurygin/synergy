import { describe, expect, it } from 'vitest';
import { Login } from './login';
import { PasswordHash } from './password-hash';
import { PasswordPolicy } from './password-policy';
import { PlainPassword } from './plain-password';

const login = Login.of('ivan');

describe('PasswordPolicy.validate', () => {
    it('accepts a valid password', () => {
        expect(PasswordPolicy.validate('correct-horse-9', login)).toEqual([]);
    });

    it('reports a too short password', () => {
        expect(PasswordPolicy.validate('abc12345', login)).toContain('too-short');
    });

    it('accepts exactly 10 characters', () => {
        expect(PasswordPolicy.validate('abcdefghi1', login)).toEqual([]);
    });

    it('requires a letter and a digit', () => {
        expect(PasswordPolicy.validate('1234567890123', login)).toEqual(['no-letter']);
        expect(PasswordPolicy.validate('abcdefghijkl', login)).toEqual(['no-digit']);
    });

    it('rejects a password equal to the login, case-insensitively', () => {
        const long = Login.of('ivan.petrov1');
        expect(PasswordPolicy.validate('IVAN.PETROV1', long)).toContain('same-as-login');
    });

    it('collects several violations', () => {
        expect(PasswordPolicy.validate('abc', login)).toEqual(['too-short', 'no-digit']);
    });
});

describe('PlainPassword', () => {
    it('does not leak the value through serialization', () => {
        const p = PlainPassword.of('secret-pass-1');
        expect(JSON.stringify({ p })).not.toContain('secret-pass-1');
        expect(String(p)).not.toContain('secret-pass-1');
        expect(p.value).toBe('secret-pass-1');
    });
});

describe('PasswordHash', () => {
    it('rejects an empty hash', () => {
        expect(() => PasswordHash.of('')).toThrow();
    });
});
