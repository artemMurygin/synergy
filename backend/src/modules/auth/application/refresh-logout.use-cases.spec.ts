/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it } from 'vitest';
import { AuthSession } from '../domain/auth-session';
import { InvalidRefreshTokenError, RefreshRaceError } from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { LogoutUseCase } from './logout.use-case';
import { RefreshSessionUseCase } from './refresh-session.use-case';
import {
    FakeSessions,
    FakeUsers,
    GRACE_MS,
    NOW,
    REFRESH_TTL_MS,
    fakeClock,
    fakeSettings,
    fakeTokens,
    fakeTx,
} from './test-doubles';

function setup(
    opts: { active?: boolean; firstUsedMsAgo?: number; mustChangePassword?: boolean } = {},
) {
    const users = new FakeUsers();
    const sessions = new FakeSessions();
    const tokens = fakeTokens();
    users.byId.set(
        'u1',
        User.restore({
            id: 'u1',
            login: Login.of('ivan'),
            passwordHash: PasswordHash.of('h'),
            mustChangePassword: opts.mustChangePassword ?? false,
            isActive: opts.active ?? true,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    const session = AuthSession.restore({
        id: 's1',
        userId: 'u1',
        createdAt: NOW,
        revokedAt: null,
        tokens: [
            {
                id: 'old',
                tokenHash: 'h:old',
                expiresAt: new Date(NOW.getTime() + REFRESH_TTL_MS),
                usedAt:
                    opts.firstUsedMsAgo === undefined
                        ? null
                        : new Date(NOW.getTime() - opts.firstUsedMsAgo),
                replacedById: null,
            },
        ],
    });
    sessions.byId.set('s1', session);
    const refresh = new RefreshSessionUseCase(
        users,
        sessions,
        tokens.access as never,
        tokens.refresh as never,
        fakeClock,
        fakeSettings,
        fakeTx,
    );
    const logout = new LogoutUseCase(sessions, tokens.refresh as never, fakeClock, fakeTx);
    return { refresh, logout, sessions, tokens, session };
}

describe('RefreshSessionUseCase', () => {
    it('rotates the token and issues a new access token', async () => {
        const { refresh, session, sessions } = setup();

        const pair = await refresh.execute('old');

        expect(pair).toEqual({
            access: 'access:u1:s1:false',
            expiresIn: 900,
            refresh: 'secret1',
            mustChangePassword: false,
        });
        expect(session.activeToken()?.tokenHash).toBe('h:secret1');
        expect(sessions.save).toHaveBeenCalledWith(session);
    });

    it('reports a pending password change so the client can restore the forced-change state', async () => {
        const { refresh } = setup({ mustChangePassword: true });

        const pair = await refresh.execute('old');

        expect(pair.mustChangePassword).toBe(true);
        expect(pair.access).toBe('access:u1:s1:true');
    });

    it('rejects an unknown token', async () => {
        const { refresh } = setup();
        await expect(refresh.execute('nope')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('throws RefreshRaceError inside the grace window and does not save', async () => {
        const { refresh, sessions } = setup({ firstUsedMsAgo: GRACE_MS - 1000 });

        await expect(refresh.execute('old')).rejects.toBeInstanceOf(RefreshRaceError);
        expect(sessions.save).not.toHaveBeenCalled();
    });

    it('saves the revoked session and throws on reuse outside the window', async () => {
        const { refresh, sessions, session } = setup({ firstUsedMsAgo: GRACE_MS + 1000 });

        await expect(refresh.execute('old')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        expect(session.isRevoked()).toBe(true);
        expect(sessions.save).toHaveBeenCalledWith(session);
    });

    it('refuses a disabled user', async () => {
        const { refresh } = setup({ active: false });
        await expect(refresh.execute('old')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });
});

describe('LogoutUseCase', () => {
    it('revokes the session', async () => {
        const { logout, session, sessions } = setup();

        await logout.execute('old');

        expect(session.isRevoked()).toBe(true);
        expect(sessions.save).toHaveBeenCalledWith(session);
    });

    it('is idempotent', async () => {
        const { logout, session } = setup();
        await logout.execute('old');
        const revokedAt = session.revokedAt;

        await expect(logout.execute('old')).resolves.toBeUndefined();
        expect(session.revokedAt).toBe(revokedAt);
    });

    it('does not fail without a token or with an unknown one', async () => {
        const { logout, sessions } = setup();

        await expect(logout.execute()).resolves.toBeUndefined();
        await expect(logout.execute('unknown')).resolves.toBeUndefined();
        expect(sessions.save).not.toHaveBeenCalled();
    });
});
