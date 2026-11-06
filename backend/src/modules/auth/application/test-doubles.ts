import { vi } from 'vitest';
import type { AuthSession } from '../domain/auth-session';
import type { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import type { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import type { UserRepository } from '../domain/ports/user-repository.port';
import type { User } from '../domain/user';

export const NOW = new Date('2026-01-01T00:00:00Z');
export const GRACE_MS = 10_000;
export const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

export class FakeUsers implements UserRepository {
    readonly byId = new Map<string, User>();
    findByLogin = vi.fn((login: Login) =>
        Promise.resolve([...this.byId.values()].find((u) => u.login.equals(login)) ?? null),
    );
    findById = vi.fn((id: string) => Promise.resolve(this.byId.get(id) ?? null));
    save = vi.fn((user: User) => {
        this.byId.set(user.id, user);
        return Promise.resolve();
    });
    existsByLogin = vi.fn((login: Login) =>
        Promise.resolve([...this.byId.values()].some((u) => u.login.equals(login))),
    );
}

export class FakeSessions implements AuthSessionRepository {
    readonly byId = new Map<string, AuthSession>();
    findByTokenHash = vi.fn((hash: string) =>
        Promise.resolve(
            [...this.byId.values()].find((s) => s.tokens.some((t) => t.tokenHash === hash)) ?? null,
        ),
    );
    findById = vi.fn((id: string) => Promise.resolve(this.byId.get(id) ?? null));
    findByIdForUpdate = vi.fn((id: string) => Promise.resolve(this.byId.get(id) ?? null));
    save = vi.fn((session: AuthSession) => {
        this.byId.set(session.id, session);
        return Promise.resolve();
    });
    revokeAllForUser = vi.fn((userId: string, exceptSessionId?: string) => {
        for (const s of this.byId.values()) {
            if (s.userId === userId && s.id !== exceptSessionId) s.revoke(NOW);
        }
        return Promise.resolve();
    });
}

export const fakeHasher = {
    hash: vi.fn((plain: string) => Promise.resolve(PasswordHash.of(`hash:${plain}`))),
    verify: vi.fn((hash: PasswordHash, plain: string) =>
        Promise.resolve(hash.value === `hash:${plain}`),
    ),
    verifyDummy: vi.fn(() => Promise.resolve()),
};

export function fakeTokens(): {
    access: { sign: ReturnType<typeof vi.fn>; verify: ReturnType<typeof vi.fn> };
    refresh: { issue: ReturnType<typeof vi.fn>; hash: ReturnType<typeof vi.fn> };
} {
    let n = 0;
    return {
        access: {
            sign: vi.fn((c: { sub: string; sid: string; mcp: boolean }) => ({
                token: `access:${c.sub}:${c.sid}:${String(c.mcp)}`,
                expiresIn: 900,
            })),
            verify: vi.fn(),
        },
        refresh: {
            issue: vi.fn((expiresAt: Date) => {
                n += 1;
                return {
                    secret: `secret${String(n)}`,
                    token: { id: `rt${String(n)}`, tokenHash: `h:secret${String(n)}`, expiresAt },
                };
            }),
            hash: vi.fn((secret: string) => `h:${secret}`),
        },
    };
}

export const fakeTx = { run: <T>(work: () => Promise<T>): Promise<T> => work() };
export const fakeClock = { now: (): Date => NOW };
export const fakeSettings = { refreshTtlMs: REFRESH_TTL_MS, refreshGraceMs: GRACE_MS };
