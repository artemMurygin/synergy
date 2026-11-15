import { describe, expect, it } from 'vitest';
import { InvalidRoleError, Role } from './role';

describe('Role', () => {
    it('accepts developer and admin', () => {
        expect(Role.of('developer')).toBe('developer');
        expect(Role.of('admin')).toBe('admin');
    });

    it('rejects unknown values', () => {
        expect(() => Role.of('root')).toThrow(InvalidRoleError);
        expect(() => Role.of('')).toThrow(InvalidRoleError);
        expect(() => Role.of(5)).toThrow(InvalidRoleError);
    });

    it('exposes the closed set with both roles', () => {
        expect(Role.ALL).toHaveLength(2);
        expect(Role.ALL).toEqual(expect.arrayContaining(['developer', 'admin']));
    });
});
