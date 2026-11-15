import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateSkillUseCase } from '../../application/create-skill.use-case';
import { ChangeSkillStatusUseCase } from '../../application/change-skill-status.use-case';
import { ListAgentsUseCase } from '../../application/list-agents.use-case';
import { ListSkillsUseCase } from '../../application/list-skills.use-case';
import type { SkillView } from '../../application/skill-view';
import {
    AgentNotFoundError,
    InvalidSkillTransitionError,
    SkillNotFoundError,
} from '../../domain/errors';
import { SkillsController } from './skills.controller';
import { type HttpFixture, startHttpFixture } from './testing/http-fixture';

const SKILL_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const USER = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';

const listAgents = { execute: vi.fn() };
const listSkills = { execute: vi.fn() };
const createSkill = { execute: vi.fn() };
const changeStatus = { execute: vi.fn() };

const skill: SkillView = {
    id: SKILL_ID,
    name: 'Сводка встречи',
    description: 'Описание',
    status: 'planned',
    agent: { id: AGENT_ID, name: 'Ассистент' },
    product: { id: 'p1', name: 'Control Center' },
    linkedRequestCount: 2,
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    statusChangedAt: new Date('2026-11-06T11:00:00.000Z'),
};

describe('SkillsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [SkillsController],
            providers: [
                { provide: ListAgentsUseCase, useValue: listAgents },
                { provide: ListSkillsUseCase, useValue: listSkills },
                { provide: CreateSkillUseCase, useValue: createSkill },
                { provide: ChangeSkillStatusUseCase, useValue: changeStatus },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        listAgents.execute.mockResolvedValue([
            {
                agent: { id: AGENT_ID, productIds: ['p1'], slug: 'assistant', name: 'Ассистент' },
                products: [{ id: 'p1', slug: 'control-center', name: 'Control Center' }],
            },
        ]);
        listSkills.execute.mockResolvedValue({ items: [skill], total: 1 });
        createSkill.execute.mockResolvedValue(skill);
        changeStatus.execute.mockResolvedValue({ ...skill, status: 'in_dev' });
    });

    const dev = (): Record<string, string> => fixture.bearer(['developer']);

    function call(
        method: string,
        path: string,
        body?: unknown,
        headers: Record<string, string> = dev(),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    describe('GET /portal/agents', () => {
        it('returns agents with products for any signed-in user', async () => {
            const response = await call('GET', '/portal/agents', undefined, fixture.bearer());

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual([
                {
                    id: AGENT_ID,
                    name: 'Ассистент',
                    product: { id: 'p1', name: 'Control Center' },
                },
            ]);
        });

        it('answers 401 without a token', async () => {
            expect((await call('GET', '/portal/agents', undefined, {})).status).toBe(401);
        });
    });

    describe('GET /portal/skills', () => {
        it('returns a page of skills with the status filter', async () => {
            const response = await call('GET', '/portal/skills?status=in_dev&limit=10&page=1');

            expect(response.status).toBe(200);
            const body = (await response.json()) as { items: Record<string, unknown>[] };
            expect(body).toMatchObject({ total: 1, limit: 10, page: 1 });
            expect(body.items[0]).toEqual({
                id: SKILL_ID,
                name: 'Сводка встречи',
                description: 'Описание',
                status: 'planned',
                agent: { id: AGENT_ID, name: 'Ассистент' },
                product: { id: 'p1', name: 'Control Center' },
                requestsCount: 2,
                createdAt: '2026-11-06T10:00:00.000Z',
                statusChangedAt: '2026-11-06T11:00:00.000Z',
            });
            expect(listSkills.execute).toHaveBeenCalledWith({
                status: 'in_dev',
                limit: 10,
                page: 1,
            });
        });

        it('answers 400 for an unknown status filter or bad pagination', async () => {
            expect((await call('GET', '/portal/skills?status=weird')).status).toBe(400);
            expect((await call('GET', '/portal/skills?limit=1000')).status).toBe(400);
            expect(listSkills.execute).not.toHaveBeenCalled();
        });

        it('answers 403 without the role and 401 without a token', async () => {
            expect((await call('GET', '/portal/skills', undefined, fixture.bearer())).status).toBe(
                403,
            );
            expect((await call('GET', '/portal/skills', undefined, {})).status).toBe(401);
        });
    });

    describe('POST /portal/skills', () => {
        it('creates a skill and answers 201', async () => {
            const response = await call('POST', '/portal/skills', {
                agentId: AGENT_ID,
                name: ' Сводка встречи ',
                description: 'Описание',
            });

            expect(response.status).toBe(201);
            expect(createSkill.execute).toHaveBeenCalledWith({
                agentId: AGENT_ID,
                name: 'Сводка встречи',
                description: 'Описание',
            });
        });

        it('defaults the description to empty', async () => {
            await call('POST', '/portal/skills', { agentId: AGENT_ID, name: 'x' });
            expect(createSkill.execute).toHaveBeenCalledWith({
                agentId: AGENT_ID,
                name: 'x',
                description: '',
            });
        });

        it.each([
            { agentId: AGENT_ID, name: '   ' },
            { name: 'x' },
            { agentId: 'nope', name: 'x' },
        ])('answers 400 for body %j', async (body) => {
            expect((await call('POST', '/portal/skills', body)).status).toBe(400);
            expect(createSkill.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for a missing agent and 403 without the role', async () => {
            createSkill.execute.mockRejectedValueOnce(new AgentNotFoundError(AGENT_ID));
            const missing = await call('POST', '/portal/skills', { agentId: AGENT_ID, name: 'x' });
            expect(missing.status).toBe(404);

            const forbidden = await call(
                'POST',
                '/portal/skills',
                { agentId: AGENT_ID, name: 'x' },
                fixture.bearer(),
            );
            expect(forbidden.status).toBe(403);
        });
    });

    describe('POST /portal/skills/:id/status', () => {
        it('changes the status on behalf of the token user', async () => {
            const response = await call('POST', `/portal/skills/${SKILL_ID}/status`, {
                status: 'in_dev',
            });

            expect(response.status).toBe(200);
            expect(((await response.json()) as { status: string }).status).toBe('in_dev');
            expect(changeStatus.execute).toHaveBeenCalledWith({
                skillId: SKILL_ID,
                to: 'in_dev',
                changedBy: USER,
            });
        });

        it('answers 400 for an unknown status or a malformed id', async () => {
            expect(
                (await call('POST', `/portal/skills/${SKILL_ID}/status`, { status: 'done' }))
                    .status,
            ).toBe(400);
            expect(
                (await call('POST', '/portal/skills/nope/status', { status: 'in_dev' })).status,
            ).toBe(400);
            expect(changeStatus.execute).not.toHaveBeenCalled();
        });

        it('maps 409 for an invalid transition and 404 for a missing skill', async () => {
            changeStatus.execute.mockRejectedValueOnce(
                new InvalidSkillTransitionError('planned', 'testing'),
            );
            const conflict = await call('POST', `/portal/skills/${SKILL_ID}/status`, {
                status: 'testing',
            });
            expect(conflict.status).toBe(409);

            changeStatus.execute.mockRejectedValueOnce(new SkillNotFoundError(SKILL_ID));
            const missing = await call('POST', `/portal/skills/${SKILL_ID}/status`, {
                status: 'in_dev',
            });
            expect(missing.status).toBe(404);
        });

        it('answers 403 without the role and 401 without a token', async () => {
            const body = { status: 'in_dev' };
            expect(
                (await call('POST', `/portal/skills/${SKILL_ID}/status`, body, fixture.bearer()))
                    .status,
            ).toBe(403);
            expect((await call('POST', `/portal/skills/${SKILL_ID}/status`, body, {})).status).toBe(
                401,
            );
        });
    });
});
