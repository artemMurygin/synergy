import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveAgentUseCase } from '../../application/archive-agent.use-case';
import { GetArchiveUseCase } from '../../application/get-archive.use-case';
import { GetCatalogUseCase } from '../../application/get-catalog.use-case';
import { SetProductDepartmentsUseCase } from '../../application/set-product-departments.use-case';
import {
    AgentNotFoundError,
    DepartmentNotFoundError,
    ProductNotFoundError,
} from '../../domain/errors';
import { CatalogController } from './catalog.controller';
import { type HttpFixture, startHttpFixture } from './testing/http-fixture';

const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const SKILL_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const CC = { id: 'p1', slug: 'control-center', name: 'Control Center' };
const DEPARTMENTS = [{ id: 'sales', name: 'Продажи' }];
const CC_WITH_DEPARTMENTS = { ...CC, departments: DEPARTMENTS };
const PRODUCT_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const getCatalog = { execute: vi.fn() };
const getArchive = { execute: vi.fn() };
const archiveAgent = { archive: vi.fn(), restore: vi.fn() };
const setDepartments = { execute: vi.fn() };

const agentView = {
    id: AGENT_ID,
    slug: 'assistant',
    name: 'Ассистент',
    products: [CC],
    archivedAt: new Date('2026-11-06T12:00:00.000Z'),
};

describe('CatalogController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [CatalogController],
            providers: [
                { provide: GetCatalogUseCase, useValue: getCatalog },
                { provide: GetArchiveUseCase, useValue: getArchive },
                { provide: ArchiveAgentUseCase, useValue: archiveAgent },
                { provide: SetProductDepartmentsUseCase, useValue: setDepartments },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        getCatalog.execute.mockResolvedValue({
            products: [
                {
                    ...CC_WITH_DEPARTMENTS,
                    agents: [
                        {
                            id: AGENT_ID,
                            slug: 'assistant',
                            name: 'Ассистент',
                            status: { code: 'working', label: 'Работает' },
                            products: [CC_WITH_DEPARTMENTS],
                            skills: [
                                {
                                    id: SKILL_ID,
                                    name: 'Сводка',
                                    description: 'Описание',
                                    status: 'testing',
                                    statusChangedAt: new Date('2026-11-06T11:00:00.000Z'),
                                    nextStatuses: ['launched', 'rework'],
                                },
                            ],
                        },
                    ],
                },
                { id: 'p2', slug: 'web', name: 'Веб', departments: [], agents: [] },
            ],
        });
        getArchive.execute.mockResolvedValue({
            agents: [
                {
                    id: AGENT_ID,
                    name: 'Ассистент',
                    products: [CC],
                    skillsCount: 3,
                    archivedAt: new Date('2026-11-06T12:00:00.000Z'),
                },
            ],
            skills: [
                {
                    id: SKILL_ID,
                    name: 'Сводка',
                    agent: { id: 'a2', name: 'Задачи' },
                    products: [CC],
                    status: 'launched',
                    archivedAt: new Date('2026-11-06T13:00:00.000Z'),
                },
            ],
        });
        setDepartments.execute.mockResolvedValue({
            ...CC,
            id: PRODUCT_ID,
            departments: DEPARTMENTS,
        });
        archiveAgent.archive.mockResolvedValue(agentView);
        archiveAgent.restore.mockResolvedValue({ ...agentView, archivedAt: null });
    });

    function call(
        method: string,
        path: string,
        headers: Record<string, string> = fixture.bearer(['developer']),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, { method, headers });
    }

    describe('GET /portal/catalog', () => {
        it('returns the catalog tree to any signed-in user', async () => {
            const response = await call('GET', '/portal/catalog', fixture.bearer());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                products: [
                    {
                        ...CC_WITH_DEPARTMENTS,
                        agents: [
                            {
                                id: AGENT_ID,
                                slug: 'assistant',
                                name: 'Ассистент',
                                status: { code: 'working', label: 'Работает' },
                                products: [CC_WITH_DEPARTMENTS],
                                skills: [
                                    {
                                        id: SKILL_ID,
                                        name: 'Сводка',
                                        description: 'Описание',
                                        status: 'testing',
                                        statusChangedAt: '2026-11-06T11:00:00.000Z',
                                        nextStatuses: ['launched', 'rework'],
                                    },
                                ],
                            },
                        ],
                    },
                    { id: 'p2', slug: 'web', name: 'Веб', departments: [], agents: [] },
                ],
            });
        });

        it('answers 401 without a token', async () => {
            expect((await call('GET', '/portal/catalog', {})).status).toBe(401);
        });
    });

    describe('GET /portal/archive', () => {
        it('returns archived agents and skills to a developer', async () => {
            const response = await call('GET', '/portal/archive');

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                agents: [
                    {
                        id: AGENT_ID,
                        name: 'Ассистент',
                        products: [CC],
                        skillsCount: 3,
                        archivedAt: '2026-11-06T12:00:00.000Z',
                    },
                ],
                skills: [
                    {
                        id: SKILL_ID,
                        name: 'Сводка',
                        agent: { id: 'a2', name: 'Задачи' },
                        products: [CC],
                        status: 'launched',
                        archivedAt: '2026-11-06T13:00:00.000Z',
                    },
                ],
            });
        });

        it('answers 403 without the role and 401 without a token', async () => {
            expect((await call('GET', '/portal/archive', fixture.bearer())).status).toBe(403);
            expect((await call('GET', '/portal/archive', {})).status).toBe(401);
            expect(getArchive.execute).not.toHaveBeenCalled();
        });
    });

    describe.each(['archive', 'restore'] as const)('POST /portal/agents/:id/%s', (action) => {
        const path = `/portal/agents/${AGENT_ID}/${action}`;

        it('answers 200 with the agent', async () => {
            const response = await call('POST', path);

            expect(response.status).toBe(200);
            expect(archiveAgent[action]).toHaveBeenCalledWith(AGENT_ID);
            expect(await response.json()).toEqual({
                id: AGENT_ID,
                name: 'Ассистент',
                products: [CC],
                archivedAt: action === 'archive' ? '2026-11-06T12:00:00.000Z' : null,
            });
        });

        it('answers 403 for an employee and 401 without a token', async () => {
            expect((await call('POST', path, fixture.bearer())).status).toBe(403);
            expect((await call('POST', path, {})).status).toBe(401);
            expect(archiveAgent[action]).not.toHaveBeenCalled();
        });

        it('answers 404 for an unknown agent and 400 for a malformed id', async () => {
            archiveAgent[action].mockRejectedValueOnce(new AgentNotFoundError(AGENT_ID));
            expect((await call('POST', path)).status).toBe(404);
            expect((await call('POST', `/portal/agents/nope/${action}`)).status).toBe(400);
        });
    });

    describe('PUT /portal/products/:id/departments', () => {
        const path = `/portal/products/${PRODUCT_ID}/departments`;

        function put(
            body: unknown,
            headers: Record<string, string> = fixture.bearer(['admin']),
            url = path,
        ): Promise<Response> {
            return fetch(`${fixture.base}${url}`, {
                method: 'PUT',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify(body),
            });
        }

        it('replaces the set and answers with the product and its departments', async () => {
            const response = await put({ departmentIds: ['sales'] });

            expect(response.status).toBe(200);
            expect(setDepartments.execute).toHaveBeenCalledWith({
                productId: PRODUCT_ID,
                departmentIds: ['sales'],
            });
            expect(await response.json()).toEqual({
                id: PRODUCT_ID,
                slug: 'control-center',
                name: 'Control Center',
                departments: DEPARTMENTS,
            });
        });

        it('accepts an empty array and non-UUID text ids', async () => {
            expect((await put({ departmentIds: [] })).status).toBe(200);
            expect((await put({ departmentIds: ['dept-1', 'Отдел 7'] })).status).toBe(200);
        });

        it('answers 403 for a developer without admin and 401 without a token', async () => {
            expect((await put({ departmentIds: [] }, fixture.bearer(['developer']))).status).toBe(
                403,
            );
            expect((await put({ departmentIds: [] }, fixture.bearer())).status).toBe(403);
            expect((await put({ departmentIds: [] }, {})).status).toBe(401);
            expect(setDepartments.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for invalid ids, too many items, or a wrong shape', async () => {
            expect((await put({ departmentIds: [''] })).status).toBe(400);
            expect((await put({ departmentIds: ['   '] })).status).toBe(400);
            expect((await put({ departmentIds: ['a'.repeat(101)] })).status).toBe(400);
            expect(
                (
                    await put({
                        departmentIds: Array.from({ length: 101 }, (_, i) => `d${String(i)}`),
                    })
                ).status,
            ).toBe(400);
            expect((await put({ departmentIds: 'sales' })).status).toBe(400);
            expect((await put({})).status).toBe(400);
            expect(setDepartments.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for a malformed product id (the use case reports it as not found)', async () => {
            setDepartments.execute.mockRejectedValueOnce(new ProductNotFoundError('nope'));
            const response = await put(
                { departmentIds: [] },
                fixture.bearer(['admin']),
                '/portal/products/nope/departments',
            );
            expect(response.status).toBe(404);
        });

        it('accepts exactly 100 departments', async () => {
            const ids = Array.from({ length: 100 }, (_, i) => `d${String(i)}`);
            expect((await put({ departmentIds: ids })).status).toBe(200);
        });

        it('answers 404 with the matching code for an unknown product or department', async () => {
            setDepartments.execute.mockRejectedValueOnce(new ProductNotFoundError(PRODUCT_ID));
            const product = await put({ departmentIds: [] });
            expect(product.status).toBe(404);
            expect(((await product.json()) as { code: string }).code).toBe(
                'PORTAL_PRODUCT_NOT_FOUND',
            );

            setDepartments.execute.mockRejectedValueOnce(new DepartmentNotFoundError('x'));
            const department = await put({ departmentIds: ['x'] });
            expect(department.status).toBe(404);
            expect(((await department.json()) as { code: string }).code).toBe(
                'PORTAL_DEPARTMENT_NOT_FOUND',
            );
        });
    });
});
