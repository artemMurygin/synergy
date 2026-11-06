import { describe, expect, it } from 'vitest';
import { ClientType, InvalidClientTypeError } from './client-type';

describe('ClientType', () => {
    it('defaults to cookie when the header is absent', () => {
        expect(ClientType.parse(undefined)).toBe('cookie');
    });

    it('accepts cookie and desktop', () => {
        expect(ClientType.parse('cookie')).toBe('cookie');
        expect(ClientType.parse('desktop')).toBe('desktop');
    });

    it('rejects unknown values', () => {
        expect(() => ClientType.parse('mobile')).toThrow(InvalidClientTypeError);
        expect(() => ClientType.parse('')).toThrow(InvalidClientTypeError);
    });
});
