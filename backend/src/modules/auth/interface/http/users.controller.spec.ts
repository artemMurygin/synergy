import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    startHttpFixture,
    type HttpFixture,
} from '../../../tasks/interface/http/testing/http-fixture';
import { ListActiveUsersUseCase } from '../../application/list-active-users.use-case';
import type { UserSearch } from '../../domain/user-search';
import { UsersController } from './users.controller';

const list = { execute: vi.fn() };

describe('UsersController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [UsersController],
            providers: [{ provide: ListActiveUsersUseCase, useValue: list }],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        list.execute.mockResolvedValue({
            items: [{ id: 'u1', login: 'anna', passwordHash: 'leak', isActive: true }],
            total: 1,
            limit: 20,
            page: 0,
        });
    });

    const get = (query = ''): Promise<Response> =>
        fetch(`${fixture.base}/users${query}`, { headers: fixture.bearer() });

    it('returns 200 with only id and login and the default paging', async () => {
        const res = await get();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            items: [{ id: 'u1', login: 'anna' }],
            total: 1,
            limit: 20,
            page: 0,
        });
        const [search, page] = list.execute.mock.calls[0] as [UserSearch, unknown];
        expect(search.text).toBeNull();
        expect(page).toEqual({ limit: 20, page: 0 });
    });

    it('passes search, limit and page to the use case', async () => {
        const res = await get('?search=an&limit=5&page=2');
        expect(res.status).toBe(200);
        const [search, page] = list.execute.mock.calls[0] as [UserSearch, unknown];
        expect(search.text).toBe('an');
        expect(page).toEqual({ limit: 5, page: 2 });
    });

    it('returns 400 when limit exceeds the maximum', async () => {
        expect((await get('?limit=101')).status).toBe(400);
        expect(list.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for a too long search', async () => {
        expect((await get(`?search=${'a'.repeat(201)}`)).status).toBe(400);
        expect(list.execute).not.toHaveBeenCalled();
    });

    it('returns 401 without an access token', async () => {
        const res = await fetch(`${fixture.base}/users`);
        expect(res.status).toBe(401);
        expect(list.execute).not.toHaveBeenCalled();
    });
});
