import { describe, expect, it } from 'vitest';
import { InvalidLoginError, Login, MAX_LOGIN_LENGTH } from './login';

describe('Login', () => {
    it('trims and lower-cases', () => {
        expect(Login.of('  Ivan.Petrov ').value).toBe('ivan.petrov');
    });

    it('rejects empty and whitespace-only values', () => {
        expect(() => Login.of('')).toThrow(InvalidLoginError);
        expect(() => Login.of('   ')).toThrow(InvalidLoginError);
    });

    it('rejects a too long login and accepts the maximum', () => {
        expect(() => Login.of('a'.repeat(MAX_LOGIN_LENGTH + 1))).toThrow(InvalidLoginError);
        expect(Login.of('a'.repeat(MAX_LOGIN_LENGTH)).value).toHaveLength(MAX_LOGIN_LENGTH);
    });

    it('compares by value', () => {
        expect(Login.of('A').equals(Login.of(' a '))).toBe(true);
        expect(Login.of('a').equals(Login.of('b'))).toBe(false);
    });
});
