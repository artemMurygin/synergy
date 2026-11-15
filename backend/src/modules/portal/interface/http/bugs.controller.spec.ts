import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BugView } from '../../application/bug-view';
import { ChangeBugStatusUseCase } from '../../application/change-bug-status.use-case';
import { GetBugUseCase } from '../../application/get-bug.use-case';
import { ListBugQueueUseCase } from '../../application/list-bug-queue.use-case';
import { ListMyBugsUseCase } from '../../application/list-my-bugs.use-case';
import { ReportBugUseCase } from '../../application/report-bug.use-case';
import {
    BugNotFoundError,
    InvalidBugTransitionError,
    ProductNotFoundError,
} from '../../domain/errors';
import { BugsController } from './bugs.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const BUG_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const PRODUCT_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const report = { execute: vi.fn() };
const listMy = { execute: vi.fn() };
const queue = { execute: vi.fn() };
const get = { execute: vi.fn() };
const change = { execute: vi.fn() };

const person = { id: USER_ID, login: 'anna', fullName: 'Иванова Анна' };
const view: BugView = {
    id: BUG_ID,
    title: 'Падает',
    description: 'Описание',
    product: { id: PRODUCT_ID, name: 'Продукт' },
    agent: { id: AGENT_ID, name: 'Агент' },
    status: 'open',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    statusChangedAt: new Date('2026-11-06T10:00:00.000Z'),
    author: person,
    statusChangedBy: null,
    wontFixReason: null,
    nextStatuses: [],
};
const validBody = {
    title: 'Падает',
    description: 'Описание',
    productId: PRODUCT_ID,
    agentId: AGENT_ID,
};

describe('BugsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [BugsController],
            providers: [
                { provide: ReportBugUseCase, useValue: report },
                { provide: ListMyBugsUseCase, useValue: listMy },
                { provide: ListBugQueueUseCase, useValue: queue },
                { provide: GetBugUseCase, useValue: get },
                { provide: ChangeBugStatusUseCase, useValue: change },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        report.execute.mockResolvedValue(view);
        listMy.execute.mockResolvedValue({ items: [view], total: 1 });
        queue.execute.mockResolvedValue({ items: [view], total: 1 });
        get.execute.mockResolvedValue(view);
        change.execute.mockResolvedValue({ ...view, status: 'in_progress' });
    });

    function call(
        method: string,
        path: string,
        body?: unknown,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    it('POST /portal/bugs answers 201 and reports on behalf of the token user', async () => {
        const response = await call('POST', '/portal/bugs', validBody);

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({
            id: BUG_ID,
            title: 'Падает',
            description: 'Описание',
            product: { id: PRODUCT_ID, name: 'Продукт' },
            agent: { id: AGENT_ID, name: 'Агент' },
            status: 'open',
            createdAt: '2026-11-06T10:00:00.000Z',
            statusChangedAt: '2026-11-06T10:00:00.000Z',
            author: person,
            statusChangedBy: null,
            wontFixReason: null,
            nextStatuses: [],
        });
        expect(report.execute).toHaveBeenCalledWith({ actorId: USER_ID, roles: [], ...validBody });
    });

    it('POST /portal/bugs passes a non-uuid product to the use case (404 comes from it, not 400)', async () => {
        report.execute.mockRejectedValueOnce(new ProductNotFoundError('x'));
        const response = await call('POST', '/portal/bugs', { ...validBody, productId: 'x' });

        expect(response.status).toBe(404);
        expect(report.execute).toHaveBeenCalled();
    });

    it('GET /portal/bugs/my goes to the list, not to :id', async () => {
        const response = await call('GET', '/portal/bugs/my?page=1&limit=5');

        expect(response.status).toBe(200);
        const json = (await response.json()) as { total: number; items: unknown[] };
        expect(json.total).toBe(1);
        expect(json.items[0]).toEqual({
            id: BUG_ID,
            title: 'Падает',
            product: { id: PRODUCT_ID, name: 'Продукт' },
            agent: { id: AGENT_ID, name: 'Агент' },
            status: 'open',
            createdAt: '2026-11-06T10:00:00.000Z',
            statusChangedAt: '2026-11-06T10:00:00.000Z',
            author: person,
        });
        expect(listMy.execute).toHaveBeenCalledWith({
            authorId: USER_ID,
            page: { limit: 5, page: 1 },
        });
        expect(get.execute).not.toHaveBeenCalled();
    });

    describe('GET /portal/bugs/queue', () => {
        it('answers 403 to an employee', async () => {
            const response = await call('GET', '/portal/bugs/queue');

            expect(response.status).toBe(403);
            expect(queue.execute).not.toHaveBeenCalled();
        });

        it('passes the status filter and defaults to null for a developer', async () => {
            const withFilter = await call(
                'GET',
                '/portal/bugs/queue?status=resolved',
                undefined,
                fixture.bearer(['developer']),
            );
            const noFilter = await call(
                'GET',
                '/portal/bugs/queue',
                undefined,
                fixture.bearer(['developer']),
            );

            expect(withFilter.status).toBe(200);
            expect(noFilter.status).toBe(200);
            expect(queue.execute).toHaveBeenNthCalledWith(1, {
                status: 'resolved',
                page: { limit: 20, page: 0 },
            });
            expect(queue.execute).toHaveBeenNthCalledWith(2, {
                status: null,
                page: { limit: 20, page: 0 },
            });
        });

        it('answers 400 to an invalid filter', async () => {
            const response = await call(
                'GET',
                '/portal/bugs/queue?status=all',
                undefined,
                fixture.bearer(['developer']),
            );

            expect(response.status).toBe(400);
        });
    });

    describe('GET /portal/bugs/:id', () => {
        it('returns the bug for the actor with their roles', async () => {
            const response = await call('GET', `/portal/bugs/${BUG_ID}`);

            expect(response.status).toBe(200);
            expect(get.execute).toHaveBeenCalledWith({
                bugId: BUG_ID,
                actorId: USER_ID,
                roles: [],
            });
        });

        it('answers 404 when the use case hides the bug', async () => {
            get.execute.mockRejectedValue(new BugNotFoundError(BUG_ID));

            const response = await call('GET', `/portal/bugs/${BUG_ID}`);

            expect(response.status).toBe(404);
        });
    });

    describe('POST /portal/bugs/:id/status', () => {
        it('answers 403 to an employee', async () => {
            const response = await call('POST', `/portal/bugs/${BUG_ID}/status`, {
                status: 'in_progress',
            });

            expect(response.status).toBe(403);
            expect(change.execute).not.toHaveBeenCalled();
        });

        it('changes the status for a developer and passes a missing reason as null', async () => {
            const response = await call(
                'POST',
                `/portal/bugs/${BUG_ID}/status`,
                { status: 'in_progress' },
                fixture.bearer(['developer']),
            );

            expect(response.status).toBe(200);
            expect(((await response.json()) as { status: string }).status).toBe('in_progress');
            expect(change.execute).toHaveBeenCalledWith({
                bugId: BUG_ID,
                actorId: USER_ID,
                roles: ['developer'],
                status: 'in_progress',
                reason: null,
            });
        });

        it('passes the reason through', async () => {
            await call(
                'POST',
                `/portal/bugs/${BUG_ID}/status`,
                { status: 'wont_fix', reason: 'дубль' },
                fixture.bearer(['developer']),
            );

            expect(change.execute).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'wont_fix', reason: 'дубль' }),
            );
        });

        it('answers 400 to an unknown status and 409 to a lost transition', async () => {
            const developer = fixture.bearer(['developer']);
            const bad = await call(
                'POST',
                `/portal/bugs/${BUG_ID}/status`,
                { status: 'closed' },
                developer,
            );
            change.execute.mockRejectedValue(new InvalidBugTransitionError('open', 'resolved'));
            const conflict = await call(
                'POST',
                `/portal/bugs/${BUG_ID}/status`,
                { status: 'resolved' },
                developer,
            );

            expect(bad.status).toBe(400);
            expect(conflict.status).toBe(409);
        });
    });

    it('answers 401 without a token', async () => {
        const response = await call('GET', '/portal/bugs/my', undefined, {});

        expect(response.status).toBe(401);
    });
});
