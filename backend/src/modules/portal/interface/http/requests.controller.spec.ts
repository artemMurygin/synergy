import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceptRequestUseCase } from '../../application/accept-request.use-case';
import { GetRequestUseCase } from '../../application/get-request.use-case';
import { ListMyRequestsUseCase } from '../../application/list-my-requests.use-case';
import { ListQueueUseCase } from '../../application/list-queue.use-case';
import { RejectRequestUseCase } from '../../application/reject-request.use-case';
import type { RequestView } from '../../application/request-view';
import { SubmitRequestUseCase } from '../../application/submit-request.use-case';
import {
    InvalidRejectReasonError,
    RequestAlreadyDecidedError,
    RequestNotFoundError,
    SkillNotFoundError,
} from '../../domain/errors';
import { RequestsController } from './requests.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const REQUEST_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const SKILL_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const submit = { execute: vi.fn() };
const listMy = { execute: vi.fn() };
const get = { execute: vi.fn() };
const queue = { execute: vi.fn() };
const accept = { execute: vi.fn() };
const reject = { execute: vi.fn() };

const view: RequestView = {
    id: REQUEST_ID,
    authorId: USER_ID,
    authorLogin: 'anna',
    authorFullName: 'Иванова Анна',
    title: 'Сверка актов',
    description: 'Сверяю вручную',
    frequency: { count: 5, period: 'week' },
    minutesPerRun: 20,
    peopleCount: 3,
    status: { code: 'new', label: 'Новая' },
    rejectReason: null,
    skill: null,
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
};

const validBody = {
    title: ' Сверка актов ',
    description: 'Сверяю вручную',
    frequency: { count: 5, period: 'week' },
    minutesPerRun: 20,
    peopleCount: 3,
};

describe('RequestsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [RequestsController],
            providers: [
                { provide: SubmitRequestUseCase, useValue: submit },
                { provide: ListMyRequestsUseCase, useValue: listMy },
                { provide: GetRequestUseCase, useValue: get },
                { provide: ListQueueUseCase, useValue: queue },
                { provide: AcceptRequestUseCase, useValue: accept },
                { provide: RejectRequestUseCase, useValue: reject },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        submit.execute.mockResolvedValue(view);
        listMy.execute.mockResolvedValue({ items: [view], total: 1 });
        get.execute.mockResolvedValue(view);
        queue.execute.mockResolvedValue({ items: [view], total: 1 });
        accept.execute.mockResolvedValue(view);
        reject.execute.mockResolvedValue(view);
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

    describe('POST /portal/requests', () => {
        it('creates a request for the token user and answers 201 with the response shape', async () => {
            const response = await call('POST', '/portal/requests', {
                ...validBody,
                authorId: 'someone-else',
            });

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                id: REQUEST_ID,
                title: 'Сверка актов',
                description: 'Сверяю вручную',
                frequency: { count: 5, period: 'week' },
                minutesPerRun: 20,
                peopleCount: 3,
                status: { code: 'new', label: 'Новая' },
                author: { id: USER_ID, login: 'anna', fullName: 'Иванова Анна' },
                rejectReason: null,
                skill: null,
                createdAt: '2026-11-06T10:00:00.000Z',
            });
            expect(submit.execute).toHaveBeenCalledWith({
                authorId: USER_ID,
                title: 'Сверка актов',
                description: 'Сверяю вручную',
                frequency: { count: 5, period: 'week' },
                minutesPerRun: 20,
                peopleCount: 3,
            });
        });

        it.each([
            ['blank title', { title: '   ' }],
            ['missing description', { description: undefined }],
            ['zero count', { frequency: { count: 0, period: 'week' } }],
            ['fractional count', { frequency: { count: 1.5, period: 'week' } }],
            ['unknown period', { frequency: { count: 1, period: 'year' } }],
            ['negative minutes', { minutesPerRun: -1 }],
            ['fractional people', { peopleCount: 2.5 }],
            ['zero people', { peopleCount: 0 }],
        ])('answers 400 for %s', async (_name, patch) => {
            const response = await call('POST', '/portal/requests', { ...validBody, ...patch });
            expect(response.status).toBe(400);
            expect(submit.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            const response = await call('POST', '/portal/requests', validBody, {});
            expect(response.status).toBe(401);
            expect(submit.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /portal/requests/my', () => {
        it('returns the author page with limit, page and total', async () => {
            const response = await call('GET', '/portal/requests/my?limit=5&page=2');

            expect(response.status).toBe(200);
            const body = (await response.json()) as { items: unknown[]; total: number };
            expect(body).toMatchObject({ total: 1, limit: 5, page: 2 });
            expect(body.items).toHaveLength(1);
            expect(listMy.execute).toHaveBeenCalledWith({ authorId: USER_ID, limit: 5, page: 2 });
        });

        it('uses default pagination', async () => {
            await call('GET', '/portal/requests/my');
            expect(listMy.execute).toHaveBeenCalledWith({ authorId: USER_ID, limit: 20, page: 0 });
        });

        it.each(['limit=101', 'limit=abc', 'page=abc', 'page=-1'])(
            'answers 400 for %s',
            async (q) => {
                expect((await call('GET', `/portal/requests/my?${q}`)).status).toBe(400);
                expect(listMy.execute).not.toHaveBeenCalled();
            },
        );

        it('answers 401 without a token', async () => {
            expect((await call('GET', '/portal/requests/my', undefined, {})).status).toBe(401);
        });
    });

    describe('GET /portal/requests/:id', () => {
        it('passes the actor, roles and id to the use case', async () => {
            const response = await call(
                'GET',
                `/portal/requests/${REQUEST_ID}`,
                undefined,
                fixture.bearer(['developer']),
            );

            expect(response.status).toBe(200);
            expect(get.execute).toHaveBeenCalledWith({
                actorId: USER_ID,
                roles: ['developer'],
                requestId: REQUEST_ID,
            });
        });

        it('answers 404 for a foreign or missing request', async () => {
            get.execute.mockRejectedValue(new RequestNotFoundError(REQUEST_ID));
            expect((await call('GET', `/portal/requests/${REQUEST_ID}`)).status).toBe(404);
        });

        it('answers 400 without calling the use case for a malformed id', async () => {
            const response = await call('GET', '/portal/requests/not-a-uuid');
            expect(response.status).toBe(400);
            expect(get.execute).not.toHaveBeenCalled();
        });
    });

    describe('GET /portal/queue', () => {
        it('returns the queue for a developer', async () => {
            const response = await call(
                'GET',
                '/portal/queue?limit=10',
                undefined,
                fixture.bearer(['developer']),
            );

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ total: 1, limit: 10, page: 0 });
            expect(queue.execute).toHaveBeenCalledWith({ limit: 10, page: 0 });
        });

        it('answers 403 without the developer role', async () => {
            expect((await call('GET', '/portal/queue')).status).toBe(403);
            expect(queue.execute).not.toHaveBeenCalled();
        });

        it('answers 401 without a token', async () => {
            expect((await call('GET', '/portal/queue', undefined, {})).status).toBe(401);
        });
    });

    describe('POST /portal/requests/:id/accept', () => {
        const dev = (): Record<string, string> => fixture.bearer(['developer']);

        it('accepts into an existing skill', async () => {
            const response = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/accept`,
                { skillId: SKILL_ID },
                dev(),
            );

            expect(response.status).toBe(200);
            expect(accept.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                target: { skillId: SKILL_ID },
            });
        });

        it('accepts with a new skill', async () => {
            const body = { agentId: AGENT_ID, name: 'Сверка актов', description: 'Описание' };
            const response = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/accept`,
                body,
                dev(),
            );

            expect(response.status).toBe(200);
            expect(accept.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                target: body,
            });
        });

        it.each([
            [
                'mixed variants',
                { skillId: SKILL_ID, agentId: AGENT_ID, name: 'x', description: '' },
            ],
            ['skillId with name', { skillId: SKILL_ID, name: 'x' }],
            ['empty body', {}],
            ['new skill without agent', { name: 'x', description: '' }],
            ['blank skill name', { agentId: AGENT_ID, name: '  ', description: '' }],
            ['malformed skill id', { skillId: 'nope' }],
        ])('answers 400 for %s', async (_name, body) => {
            const response = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/accept`,
                body,
                dev(),
            );
            expect(response.status).toBe(400);
            expect(accept.execute).not.toHaveBeenCalled();
        });

        it('answers 403 without the developer role', async () => {
            const response = await call('POST', `/portal/requests/${REQUEST_ID}/accept`, {
                skillId: SKILL_ID,
            });
            expect(response.status).toBe(403);
            expect(accept.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for a missing skill and 409 for a decided request', async () => {
            accept.execute.mockRejectedValueOnce(new SkillNotFoundError(SKILL_ID));
            const notFound = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/accept`,
                { skillId: SKILL_ID },
                dev(),
            );
            expect(notFound.status).toBe(404);

            accept.execute.mockRejectedValueOnce(new RequestAlreadyDecidedError(REQUEST_ID));
            const conflict = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/accept`,
                { skillId: SKILL_ID },
                dev(),
            );
            expect(conflict.status).toBe(409);
        });
    });

    describe('POST /portal/requests/:id/reject', () => {
        const dev = (): Record<string, string> => fixture.bearer(['developer']);

        it('rejects with a trimmed reason', async () => {
            const response = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/reject`,
                { reason: ' Уже есть в поставке ' },
                dev(),
            );

            expect(response.status).toBe(200);
            expect(reject.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                reason: 'Уже есть в поставке',
            });
        });

        it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 5 }])(
            'answers 400 for body %j',
            async (body) => {
                const response = await call(
                    'POST',
                    `/portal/requests/${REQUEST_ID}/reject`,
                    body,
                    dev(),
                );
                expect(response.status).toBe(400);
                expect(reject.execute).not.toHaveBeenCalled();
            },
        );

        it('maps domain errors: 400 for a bad reason, 409 for a decided request', async () => {
            reject.execute.mockRejectedValueOnce(new InvalidRejectReasonError('bad'));
            const bad = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/reject`,
                { reason: 'x' },
                dev(),
            );
            expect(bad.status).toBe(400);

            reject.execute.mockRejectedValueOnce(new RequestAlreadyDecidedError(REQUEST_ID));
            const conflict = await call(
                'POST',
                `/portal/requests/${REQUEST_ID}/reject`,
                { reason: 'x' },
                dev(),
            );
            expect(conflict.status).toBe(409);
        });

        it('answers 403 without the developer role', async () => {
            const response = await call('POST', `/portal/requests/${REQUEST_ID}/reject`, {
                reason: 'x',
            });
            expect(response.status).toBe(403);
        });
    });
});
