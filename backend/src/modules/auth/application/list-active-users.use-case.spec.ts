import { beforeEach, describe, expect, it } from 'vitest';
import { Login } from '../domain/login';
import { PasswordHash } from '../domain/password-hash';
import { User } from '../domain/user';
import { UserSearch } from '../domain/user-search';
import { ListActiveUsersUseCase } from './list-active-users.use-case';
import { FakeUsers, NOW } from './test-doubles';

function addUser(users: FakeUsers, id: string, login: string, isActive = true): void {
    users.byId.set(
        id,
        User.restore({
            id,
            login: Login.of(login),
            passwordHash: PasswordHash.of('secret-hash'),
            mustChangePassword: false,
            isActive,
            createdAt: NOW,
            passwordChangedAt: NOW,
        }),
    );
}

describe('ListActiveUsersUseCase', () => {
    let users: FakeUsers;
    let useCase: ListActiveUsersUseCase;

    beforeEach(() => {
        users = new FakeUsers();
        addUser(users, 'u3', 'yuri');
        addUser(users, 'u1', 'anna');
        addUser(users, 'u2', 'ivan');
        addUser(users, 'u4', 'andrey');
        addUser(users, 'off', 'anton', false);
        useCase = new ListActiveUsersUseCase(users);
    });

    it('returns active users sorted by login with total and paging echo', async () => {
        const result = await useCase.execute(UserSearch.of(undefined), { limit: 20, page: 0 });
        expect(result).toEqual({
            items: [
                { id: 'u4', login: 'andrey' },
                { id: 'u1', login: 'anna' },
                { id: 'u2', login: 'ivan' },
                { id: 'u3', login: 'yuri' },
            ],
            total: 4,
            limit: 20,
            page: 0,
        });
    });

    it('excludes inactive users even when they match the search', async () => {
        const result = await useCase.execute(UserSearch.of('anton'), { limit: 20, page: 0 });
        expect(result.items).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('searches case-insensitively by substring', async () => {
        const result = await useCase.execute(UserSearch.of('AN'), { limit: 20, page: 0 });
        expect(result.items.map((u) => u.login)).toEqual(['andrey', 'anna', 'ivan']);
        expect(result.total).toBe(3);
    });

    it('paginates with a zero-based page and keeps the overall total', async () => {
        const second = await useCase.execute(UserSearch.of(undefined), { limit: 2, page: 1 });
        expect(second.items.map((u) => u.login)).toEqual(['ivan', 'yuri']);
        expect(second.total).toBe(4);
        expect(second.limit).toBe(2);
        expect(second.page).toBe(1);
        const beyond = await useCase.execute(UserSearch.of(undefined), { limit: 2, page: 5 });
        expect(beyond.items).toEqual([]);
        expect(beyond.total).toBe(4);
    });
});
