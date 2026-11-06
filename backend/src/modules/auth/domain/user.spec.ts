import { describe, expect, it } from 'vitest';
import { Login } from './login';
import { PasswordHash } from './password-hash';
import { User } from './user';

const t0 = new Date('2026-01-01T00:00:00Z');
const t1 = new Date('2026-02-01T00:00:00Z');

const fresh = (): User =>
    User.createWithTemporaryPassword({
        id: 'u1',
        login: Login.of('ivan'),
        passwordHash: PasswordHash.of('hash-1'),
        now: t0,
    });

describe('User', () => {
    it('is created with mustChangePassword = true and active', () => {
        const u = fresh();
        expect(u.mustChangePassword).toBe(true);
        expect(u.isActive).toBe(true);
        expect(u.createdAt).toEqual(t0);
        expect(u.passwordChangedAt).toEqual(t0);
    });

    it('changePassword resets the flag and updates the hash and time', () => {
        const u = fresh();
        u.changePassword(PasswordHash.of('hash-2'), t1);
        expect(u.mustChangePassword).toBe(false);
        expect(u.passwordHash.value).toBe('hash-2');
        expect(u.passwordChangedAt).toEqual(t1);
    });

    it('a disabled user cannot sign in', () => {
        const u = fresh();
        expect(u.canSignIn()).toBe(true);
        u.deactivate();
        expect(u.isActive).toBe(false);
        expect(u.canSignIn()).toBe(false);
    });

    it('restore keeps persisted state', () => {
        const u = User.restore({
            id: 'u2',
            login: Login.of('anna'),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: false,
            isActive: false,
            createdAt: t0,
            passwordChangedAt: t1,
        });
        expect(u.mustChangePassword).toBe(false);
        expect(u.canSignIn()).toBe(false);
    });
});
