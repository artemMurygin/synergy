/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../domain/auth-session';
import {
    InvalidRefreshTokenError,
    RefreshRaceError,
    SamePasswordError,
    WeakPasswordError,
    WrongPasswordError,
} from '../domain/errors';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { ChangePasswordUseCase } from './change-password.use-case';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import {
    FakeSessions,
    FakeUsers,
    NOW,
    REFRESH_TTL_MS,
    fakeClock,
    fakeHasher,
    fakeSettings,
    fakeTokens,
    fakeTx,
} from './test-doubles';

function newSession(id: string): AuthSession {
    return AuthSession.restore({
        id,
        userId: 'u1',
        createdAt: NOW,
        revokedAt: null,
        tokens: [
            {
                id: `t-${id}`,
                tokenHash: `h:${id}`,
                expiresAt: new Date(NOW.getTime() + REFRESH_TTL_MS),
                usedAt: null,
                replacedById: null,
            },
        ],
    });
}

function sessionOf(sessions: FakeSessions): AuthSession {
    const session = sessions.byId.get('current');
    if (session === undefined) throw new Error('no session');
    return session;
}

function setup() {
    const users = new FakeUsers();
    const sessions = new FakeSessions();
    const tokens = fakeTokens();
    users.byId.set(
        'u1',
        User.restore({
            id: 'u1',
            login: Login.of('ivan'),
            passwordHash: PasswordHash.of('hash:temporary-1'),
            mustChangePassword: true,
            isActive: true,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
    sessions.byId.set('current', newSession('current'));
    sessions.byId.set('other', newSession('other'));
    const change = new ChangePasswordUseCase(
        users,
        sessions,
        fakeHasher,
        tokens.access as never,
        tokens.refresh as never,
        fakeClock,
        fakeSettings,
        fakeTx,
    );
    const me = new GetCurrentUserUseCase(users);
    return { change, me, users, sessions };
}

describe('ChangePasswordUseCase', () => {
    it('changes the password, revokes other sessions and issues a fresh pair', async () => {
        const { change, users, sessions } = setup();

        const pair = await change.execute('u1', 'current', 'temporary-1', 'brand-new-pass1');

        const user = users.byId.get('u1');
        expect(user?.mustChangePassword).toBe(false);
        expect(user?.passwordHash.value).toBe('hash:brand-new-pass1');
        expect(sessions.byId.get('other')?.isRevoked()).toBe(true);
        expect(sessions.byId.get('current')?.isRevoked()).toBe(false);
        expect(sessions.revokeAllForUser).toHaveBeenCalledWith('u1', 'current');
        expect(pair).toEqual({
            access: 'access:u1:current:false',
            expiresIn: 900,
            refresh: 'secret1',
            mustChangePassword: false,
        });
        expect(sessions.byId.get('current')?.activeToken()?.tokenHash).toBe('h:secret1');
    });

    it('locks the session row and does not read it without a lock', async () => {
        const { change, sessions } = setup();
        await change.execute('u1', 'current', 'temporary-1', 'brand-new-pass1');
        expect(sessions.findByIdForUpdate).toHaveBeenCalledWith('current');
        expect(sessions.findById).not.toHaveBeenCalled();
    });

    it('fails with REFRESH_RACE when the token was just rotated, and changes nothing', async () => {
        const { change, sessions, users } = setup();
        vi.spyOn(sessionOf(sessions), 'rotate').mockReturnValue({
            kind: 'Race',
        });
        await expect(
            change.execute('u1', 'current', 'temporary-1', 'brand-new-pass1'),
        ).rejects.toBeInstanceOf(RefreshRaceError);
        expect(sessions.save).not.toHaveBeenCalled();
        expect(users.save).not.toHaveBeenCalled();
    });

    it('fails with TOKEN_INVALID when the token turns out to be reused', async () => {
        const { change, sessions } = setup();
        vi.spyOn(sessionOf(sessions), 'rotate').mockReturnValue({
            kind: 'ReuseDetected',
        });
        await expect(
            change.execute('u1', 'current', 'temporary-1', 'brand-new-pass1'),
        ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });

    it('rejects a wrong current password', async () => {
        const { change, users } = setup();
        await expect(
            change.execute('u1', 'current', 'wrong', 'brand-new-pass1'),
        ).rejects.toBeInstanceOf(WrongPasswordError);
        expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects a new password equal to the current one', async () => {
        const { change } = setup();
        await expect(
            change.execute('u1', 'current', 'temporary-1', 'temporary-1'),
        ).rejects.toBeInstanceOf(SamePasswordError);
    });

    it('rejects a weak password with the list of violations', async () => {
        const { change, users } = setup();

        const error = await change
            .execute('u1', 'current', 'temporary-1', 'short')
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(WeakPasswordError);
        expect((error as WeakPasswordError).violations).toEqual(['too-short', 'no-digit']);
        expect(users.save).not.toHaveBeenCalled();
    });

    it('rejects when the current session is revoked or missing', async () => {
        const { change, sessions } = setup();
        sessions.byId.get('current')?.revoke(NOW);
        await expect(
            change.execute('u1', 'current', 'temporary-1', 'brand-new-pass1'),
        ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
        await expect(
            change.execute('u1', 'missing', 'temporary-1', 'brand-new-pass1'),
        ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    });
});

describe('GetCurrentUserUseCase', () => {
    it('returns id, login and the flag without the hash', async () => {
        const { me } = setup();
        const result = await me.execute('u1');
        expect(result).toEqual({ id: 'u1', login: 'ivan', mustChangePassword: true });
    });
});
