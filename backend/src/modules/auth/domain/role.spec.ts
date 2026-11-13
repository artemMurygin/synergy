import { describe, expect, it } from 'vitest';
import { InvalidRoleError, Role } from './role';

describe('Role', () => {
    it('accepts developer', () => {
        expect(Role.of('developer')).toBe('developer');
    });

    it('rejects unknown values', () => {
        expect(() => Role.of('admin')).toThrow(InvalidRoleError);
        expect(() => Role.of('')).toThrow(InvalidRoleError);
        expect(() => Role.of(5)).toThrow(InvalidRoleError);
    });

    it('exposes the closed set', () => {
        expect(Role.ALL).toEqual(['developer']);
    });
});
