import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveAgentUseCase } from '../../application/archive-agent.use-case';
import { GetArchiveUseCase } from '../../application/get-archive.use-case';
import { GetCatalogUseCase } from '../../application/get-catalog.use-case';
import { AgentNotFoundError } from '../../domain/errors';
import { CatalogController } from './catalog.controller';
import { type HttpFixture, startHttpFixture } from './testing/http-fixture';

const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const SKILL_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const CC = { id: 'p1', slug: 'control-center', name: 'Control Center' };

const getCatalog = { execute: vi.fn() };
const getArchive = { execute: vi.fn() };
const archiveAgent = { archive: vi.fn(), restore: vi.fn() };

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
                    ...CC,
                    agents: [
                        {
                            id: AGENT_ID,
                            slug: 'assistant',
                            name: 'Ассистент',
                            status: { code: 'working', label: 'Работает' },
                            products: [CC],
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
                { id: 'p2', slug: 'web', name: 'Веб', agents: [] },
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
                        ...CC,
                        agents: [
                            {
                                id: AGENT_ID,
                                slug: 'assistant',
                                name: 'Ассистент',
                                status: { code: 'working', label: 'Работает' },
                                products: [CC],
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
                    { id: 'p2', slug: 'web', name: 'Веб', agents: [] },
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
});
