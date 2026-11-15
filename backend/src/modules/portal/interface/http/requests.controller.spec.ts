import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceptRequestUseCase } from '../../application/accept-request.use-case';
import { GetRequestUseCase } from '../../application/get-request.use-case';
import { ListMyRequestsUseCase } from '../../application/list-my-requests.use-case';
import { ListQueueUseCase } from '../../application/list-queue.use-case';
import { RejectRequestUseCase } from '../../application/reject-request.use-case';
import type { RequestView } from '../../application/request-view';
import { SubmitRequestUseCase } from '../../application/submit-request.use-case';
import { TakeRequestUseCase } from '../../application/take-request.use-case';
import {
    AgentNameTakenError,
    InvalidRejectReasonError,
    ProductNotFoundError,
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotFoundError,
    RequestNotTakenError,
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
const take = { execute: vi.fn() };
const PRODUCT_ID = '8f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

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
    reviewer: null,
    takenAt: null,
    effortHours: null,
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
                { provide: TakeRequestUseCase, useValue: take },
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
        take.execute.mockResolvedValue(view);
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
                reviewer: null,
                takenAt: null,
                effortHours: null,
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

    describe('POST /portal/requests/:id/take', () => {
        const dev = (): Record<string, string> => fixture.bearer(['developer']);
        const url = `/portal/requests/${REQUEST_ID}/take`;

        it('takes the request for the token user and answers 200 with reviewer fields', async () => {
            take.execute.mockResolvedValue({
                ...view,
                status: { code: 'under_review', label: 'На рассмотрении' },
                reviewer: { id: USER_ID, login: 'dev', fullName: 'Петров Пётр' },
                takenAt: new Date('2026-11-07T09:00:00.000Z'),
            });

            const response = await call('POST', url, undefined, dev());

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                status: { code: 'under_review', label: 'На рассмотрении' },
                reviewer: { id: USER_ID, login: 'dev', fullName: 'Петров Пётр' },
                takenAt: '2026-11-07T09:00:00.000Z',
                effortHours: null,
            });
            expect(take.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                reviewerId: USER_ID,
            });
        });

        it('answers 401 without a token and 403 without the developer role', async () => {
            expect((await call('POST', url, undefined, {})).status).toBe(401);
            expect((await call('POST', url)).status).toBe(403);
            expect(take.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for a malformed id', async () => {
            const response = await call('POST', '/portal/requests/nope/take', undefined, dev());
            expect(response.status).toBe(400);
            expect(take.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for a missing request and 409 for taken or decided', async () => {
            take.execute.mockRejectedValueOnce(new RequestNotFoundError(REQUEST_ID));
            expect((await call('POST', url, undefined, dev())).status).toBe(404);

            take.execute.mockRejectedValueOnce(new RequestAlreadyTakenError(REQUEST_ID));
            const taken = await call('POST', url, undefined, dev());
            expect(taken.status).toBe(409);
            expect(await taken.json()).toMatchObject({ code: 'PORTAL_REQUEST_ALREADY_TAKEN' });

            take.execute.mockRejectedValueOnce(new RequestAlreadyDecidedError(REQUEST_ID));
            expect((await call('POST', url, undefined, dev())).status).toBe(409);
        });
    });

    describe('POST /portal/requests/:id/accept', () => {
        const dev = (): Record<string, string> => fixture.bearer(['developer']);
        const url = `/portal/requests/${REQUEST_ID}/accept`;
        const newAgent = {
            kind: 'new_agent',
            agent: { name: 'Агент закупок', productIds: [PRODUCT_ID] },
            skill: { name: 'Сверка актов', description: 'Описание' },
        };

        it('accepts into an existing skill with an estimate', async () => {
            const body = {
                effortHours: 16,
                target: { kind: 'existing_skill', skillId: SKILL_ID },
            };
            const response = await call('POST', url, body, dev());

            expect(response.status).toBe(200);
            expect(accept.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                effortHours: 16,
                target: body.target,
            });
        });

        it('accepts with a new skill', async () => {
            const target = {
                kind: 'new_skill',
                agentId: AGENT_ID,
                name: 'Сверка актов',
                description: 'Описание',
            };
            const response = await call('POST', url, { effortHours: 8, target }, dev());

            expect(response.status).toBe(200);
            expect(accept.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                effortHours: 8,
                target,
            });
        });

        it('accepts with a new agent and a new product', async () => {
            const target = {
                ...newAgent,
                agent: {
                    name: 'Агент закупок',
                    productIds: [],
                    newProduct: { name: 'Закупки' },
                },
            };
            const response = await call('POST', url, { effortHours: 40, target }, dev());

            expect(response.status).toBe(200);
            expect(accept.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                decidedBy: USER_ID,
                effortHours: 40,
                target,
            });
        });

        it('accepts with a new agent over existing products', async () => {
            const response = await call('POST', url, { effortHours: 40, target: newAgent }, dev());
            expect(response.status).toBe(200);
        });

        const existing = { kind: 'existing_skill', skillId: SKILL_ID };
        it.each([
            ['old top-level skillId', { skillId: SKILL_ID }],
            ['old top-level new skill', { agentId: AGENT_ID, name: 'x', description: '' }],
            ['empty body', {}],
            ['missing target', { effortHours: 5 }],
            ['missing effort', { target: existing }],
            ['zero effort', { effortHours: 0, target: existing }],
            ['negative effort', { effortHours: -3, target: existing }],
            ['fractional effort', { effortHours: 1.5, target: existing }],
            ['effort above 2000', { effortHours: 2001, target: existing }],
            ['string effort', { effortHours: '5', target: existing }],
            ['unknown kind', { effortHours: 5, target: { kind: 'other', skillId: SKILL_ID } }],
            [
                'malformed skill id',
                { effortHours: 5, target: { kind: 'existing_skill', skillId: 'x' } },
            ],
            [
                'new skill without agent',
                { effortHours: 5, target: { kind: 'new_skill', name: 'x', description: '' } },
            ],
            [
                'blank skill name',
                {
                    effortHours: 5,
                    target: { kind: 'new_skill', agentId: AGENT_ID, name: '  ', description: '' },
                },
            ],
            [
                'new agent without products',
                {
                    effortHours: 5,
                    target: { ...newAgent, agent: { name: 'A', productIds: [] } },
                },
            ],
            [
                'new agent with blank name',
                {
                    effortHours: 5,
                    target: { ...newAgent, agent: { name: ' ', productIds: [PRODUCT_ID] } },
                },
            ],
            [
                'new agent with too long name',
                {
                    effortHours: 5,
                    target: {
                        ...newAgent,
                        agent: { name: 'a'.repeat(101), productIds: [PRODUCT_ID] },
                    },
                },
            ],
            [
                'new product with too long name',
                {
                    effortHours: 5,
                    target: {
                        ...newAgent,
                        agent: {
                            name: 'A',
                            productIds: [],
                            newProduct: { name: 'p'.repeat(101) },
                        },
                    },
                },
            ],
            [
                'new agent with malformed product id',
                {
                    effortHours: 5,
                    target: { ...newAgent, agent: { name: 'A', productIds: ['nope'] } },
                },
            ],
            [
                'new agent without skill',
                { effortHours: 5, target: { kind: 'new_agent', agent: newAgent.agent } },
            ],
        ])('answers 400 for %s', async (_name, body) => {
            const response = await call('POST', url, body, dev());
            expect(response.status).toBe(400);
            expect(accept.execute).not.toHaveBeenCalled();
        });

        it('answers 403 without the developer role', async () => {
            const response = await call('POST', url, { effortHours: 5, target: existing });
            expect(response.status).toBe(403);
            expect(accept.execute).not.toHaveBeenCalled();
        });

        it('maps domain errors to 404 and 409', async () => {
            const body = { effortHours: 5, target: existing };

            accept.execute.mockRejectedValueOnce(new SkillNotFoundError(SKILL_ID));
            expect((await call('POST', url, body, dev())).status).toBe(404);

            accept.execute.mockRejectedValueOnce(new ProductNotFoundError(PRODUCT_ID));
            expect((await call('POST', url, body, dev())).status).toBe(404);

            accept.execute.mockRejectedValueOnce(new RequestAlreadyDecidedError(REQUEST_ID));
            expect((await call('POST', url, body, dev())).status).toBe(409);

            accept.execute.mockRejectedValueOnce(new RequestNotTakenError(REQUEST_ID));
            const notTaken = await call('POST', url, body, dev());
            expect(notTaken.status).toBe(409);
            expect(await notTaken.json()).toMatchObject({ code: 'PORTAL_REQUEST_NOT_TAKEN' });

            accept.execute.mockRejectedValueOnce(new AgentNameTakenError());
            const taken = await call('POST', url, body, dev());
            expect(taken.status).toBe(409);
            expect(await taken.json()).toMatchObject({ code: 'PORTAL_AGENT_NAME_TAKEN' });
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
