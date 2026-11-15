import { vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import type { AuthSession } from '../domain/auth-session';
import type { Department } from '../domain/department';
import type { DepartmentName } from '../domain/department-name';
import type { DepartmentView } from '../domain/department-view';
import type { Email } from '../domain/email';
import type { EmployeeProfile } from '../domain/employee-profile';
import type { EmployeeListFilter, EmployeeView } from '../domain/employee-view';
import type { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { AdminLock } from '../domain/ports/admin-lock.port';
import type { AuthSessionRepository } from '../domain/ports/auth-session-repository.port';
import { DepartmentRepository } from '../domain/ports/department-repository.port';
import { EmployeeQuery } from '../domain/ports/employee-query.port';
import { UserProfileRepository } from '../domain/ports/user-profile-repository.port';
import type { UserRepository } from '../domain/ports/user-repository.port';
import type { Role } from '../domain/role';
import type { User } from '../domain/user';
import type { UserSearch } from '../domain/user-search';

export const NOW = new Date('2026-01-01T00:00:00Z');
export const GRACE_MS = 10_000;
export const REFRESH_TTL_MS = 14 * 24 * 3600 * 1000;

export class FakeUsers implements UserRepository {
    readonly byId = new Map<string, User>();
    readonly roles = new Map<string, Role[]>();
    findRoles = vi.fn((userId: string) => Promise.resolve([...(this.roles.get(userId) ?? [])]));
    assignRoles = vi.fn((userId: string, roles: Role[]) => {
        const current = this.roles.get(userId) ?? [];
        this.roles.set(userId, [...new Set([...current, ...roles])]);
        return Promise.resolve();
    });
    replaceRoles = vi.fn((userId: string, roles: Role[]) => {
        this.roles.set(userId, [...new Set(roles)]);
        return Promise.resolve();
    });
    setActive = vi.fn((userId: string, active: boolean) => {
        const user = this.byId.get(userId);
        if (user) {
            if (active) user.activate();
            else user.deactivate();
        }
        return Promise.resolve();
    });
    countActiveAdmins = vi.fn(() =>
        Promise.resolve(
            [...this.byId.values()].filter(
                (u) => u.isActive && (this.roles.get(u.id) ?? []).includes('admin'),
            ).length,
        ),
    );
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
    searchActive = vi.fn((search: UserSearch, limit: number, offset: number) => {
        const needle = search.text?.toLowerCase() ?? '';
        const matched = [...this.byId.values()]
            .filter((u) => u.isActive && u.login.value.includes(needle))
            .map((u) => ({ id: u.id, login: u.login.value }))
            .sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
        return Promise.resolve({
            items: matched.slice(offset, offset + limit),
            total: matched.length,
        });
    });
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
            sign: vi.fn((c: { sub: string; sid: string; mcp: boolean; rol?: Role[] }) => ({
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

export const fakeTx = new InMemoryTransactionRunner();
export const fakeClock = { now: (): Date => NOW };
export const fakeSettings = { refreshTtlMs: REFRESH_TTL_MS, refreshGraceMs: GRACE_MS };

export class FakeAdminLock extends AdminLock {
    acquire = vi.fn(() => Promise.resolve());
}

export class FakeProfiles extends UserProfileRepository {
    readonly byUserId = new Map<string, EmployeeProfile>();
    findByUserId = vi.fn((userId: string) => Promise.resolve(this.byUserId.get(userId) ?? null));
    save = vi.fn((profile: EmployeeProfile) => {
        this.byUserId.set(profile.userId, profile);
        return Promise.resolve();
    });
    isEmailTaken = vi.fn((email: Email, exceptUserId?: string) =>
        Promise.resolve(
            [...this.byUserId.values()].some(
                (p) => p.userId !== exceptUserId && p.email?.equals(email) === true,
            ),
        ),
    );
}

export class FakeDepartments extends DepartmentRepository {
    readonly byId = new Map<string, Department>();
    findById = vi.fn((id: string) => Promise.resolve(this.byId.get(id) ?? null));
    save = vi.fn((department: Department) => {
        this.byId.set(department.id, department);
        return Promise.resolve();
    });
    isNameTaken = vi.fn((name: DepartmentName, exceptId?: string) =>
        Promise.resolve(
            [...this.byId.values()].some(
                (d) => d.id !== exceptId && d.name.value.toLowerCase() === name.value.toLowerCase(),
            ),
        ),
    );
    constructor(private readonly profiles?: FakeProfiles) {
        super();
    }
    countEmployees = vi.fn((departmentId: string) =>
        Promise.resolve(
            [...(this.profiles?.byUserId.values() ?? [])].filter(
                (p) => p.departmentId === departmentId,
            ).length,
        ),
    );
    delete = vi.fn((id: string) => {
        this.byId.delete(id);
        return Promise.resolve();
    });
}

/** In-memory read model joined from the fake repositories. */
export class FakeEmployeeQuery extends EmployeeQuery {
    constructor(
        private readonly users: FakeUsers,
        private readonly profiles: FakeProfiles,
        private readonly departments: FakeDepartments,
    ) {
        super();
    }

    private view(userId: string): EmployeeView | null {
        const user = this.users.byId.get(userId);
        if (user === undefined) return null;
        const profile = this.profiles.byUserId.get(userId);
        const department =
            profile?.departmentId === undefined
                ? undefined
                : this.departments.byId.get(profile.departmentId);
        const name = profile?.name;
        return {
            id: user.id,
            login: user.login.value,
            isActive: user.isActive,
            mustChangePassword: user.mustChangePassword,
            fullName:
                name === undefined
                    ? user.login.value
                    : [name.lastName, name.firstName, name.middleName]
                          .filter((part) => part !== undefined)
                          .join(' '),
            lastName: name?.lastName ?? null,
            firstName: name?.firstName ?? null,
            middleName: name?.middleName ?? null,
            position: profile?.position ?? null,
            email: profile?.email?.value ?? null,
            scrmEmployeeId: profile?.scrmEmployeeId ?? null,
            department:
                department === undefined
                    ? null
                    : { id: department.id, name: department.name.value },
            roles: [...(this.users.roles.get(userId) ?? [])],
        };
    }

    list = vi.fn((filter: EmployeeListFilter) => {
        const needle = filter.search?.toLowerCase();
        const all = [...this.users.byId.keys()]
            .map((id) => this.view(id))
            .filter((v): v is EmployeeView => v !== null)
            .filter((v) => filter.isActive === undefined || v.isActive === filter.isActive)
            .filter(
                (v) =>
                    filter.departmentId === undefined || v.department?.id === filter.departmentId,
            )
            .filter(
                (v) =>
                    needle === undefined ||
                    [v.login, v.fullName, v.email ?? ''].some((f) =>
                        f.toLowerCase().includes(needle),
                    ),
            )
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
        const offset = (filter.page - 1) * filter.limit;
        return Promise.resolve({
            items: all.slice(offset, offset + filter.limit),
            total: all.length,
        });
    });
    findById = vi.fn((userId: string) => Promise.resolve(this.view(userId)));
    listDepartments = vi.fn(() => {
        const views = [...this.departments.byId.values()]
            .map((d) => this.departmentView(d.id))
            .filter((v): v is DepartmentView => v !== null)
            .sort((a, b) => a.name.localeCompare(b.name));
        return Promise.resolve(views);
    });
    findDepartmentById = vi.fn((id: string) => Promise.resolve(this.departmentView(id)));

    private departmentView(id: string): DepartmentView | null {
        const department = this.departments.byId.get(id);
        if (department === undefined) return null;
        const head = department.headUserId === undefined ? null : this.view(department.headUserId);
        return {
            id: department.id,
            name: department.name.value,
            head:
                head === null
                    ? null
                    : {
                          id: head.id,
                          login: head.login,
                          fullName: head.fullName,
                          isActive: head.isActive,
                      },
            employeeCount: [...this.profiles.byUserId.values()].filter((p) => p.departmentId === id)
                .length,
        };
    }
}
