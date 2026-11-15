import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateSkillUseCase } from '../../application/create-skill.use-case';
import { ChangeSkillStatusUseCase } from '../../application/change-skill-status.use-case';
import { ArchiveSkillUseCase } from '../../application/archive-skill.use-case';
import { ListAgentsUseCase } from '../../application/list-agents.use-case';
import { ListSkillsUseCase } from '../../application/list-skills.use-case';
import type { SkillView } from '../../application/skill-view';
import {
    AgentArchivedError,
    AgentNotFoundError,
    InvalidSkillTransitionError,
    SkillArchivedError,
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
const archiveSkill = { archive: vi.fn(), restore: vi.fn() };

const skill: SkillView = {
    id: SKILL_ID,
    name: 'Сводка встречи',
    description: 'Описание',
    status: 'planned',
    agent: { id: AGENT_ID, name: 'Ассистент' },
    products: [{ id: 'p1', slug: 'control-center', name: 'Control Center' }],
    nextStatuses: ['in_dev'],
    linkedRequestCount: 2,
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    statusChangedAt: new Date('2026-11-06T11:00:00.000Z'),
    launchedAt: null,
    archivedAt: null,
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
                { provide: ArchiveSkillUseCase, useValue: archiveSkill },
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
                agent: {
                    id: AGENT_ID,
                    productIds: ['p1', 'p2'],
                    slug: 'assistant',
                    name: 'Ассистент',
                    archivedAt: null,
                },
                products: [
                    { id: 'p1', slug: 'control-center', name: 'Control Center' },
                    { id: 'p2', slug: 'telegram', name: 'Telegram-бот' },
                ],
            },
        ]);
        listSkills.execute.mockResolvedValue({ items: [skill], total: 1 });
        createSkill.execute.mockResolvedValue(skill);
        changeStatus.execute.mockResolvedValue({ ...skill, status: 'in_dev' });
        archiveSkill.archive.mockResolvedValue({
            ...skill,
            archivedAt: new Date('2026-11-06T12:00:00.000Z'),
        });
        archiveSkill.restore.mockResolvedValue(skill);
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
                    products: [
                        { id: 'p1', slug: 'control-center', name: 'Control Center' },
                        { id: 'p2', slug: 'telegram', name: 'Telegram-бот' },
                    ],
                    archivedAt: null,
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
                products: [{ id: 'p1', slug: 'control-center', name: 'Control Center' }],
                nextStatuses: ['in_dev'],
                requestsCount: 2,
                createdAt: '2026-11-06T10:00:00.000Z',
                statusChangedAt: '2026-11-06T11:00:00.000Z',
                launchedAt: null,
                archivedAt: null,
            });
            expect(listSkills.execute).toHaveBeenCalledWith({
                status: 'in_dev',
                limit: 10,
                page: 1,
            });
        });

        it('accepts the rework status filter', async () => {
            const response = await call('GET', '/portal/skills?status=rework');

            expect(response.status).toBe(200);
            expect(listSkills.execute).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'rework' }),
            );
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

        it('accepts rework as a target status', async () => {
            const response = await call('POST', `/portal/skills/${SKILL_ID}/status`, {
                status: 'rework',
            });
            expect(response.status).toBe(200);
        });

        it('maps 409 for an archived skill or agent', async () => {
            changeStatus.execute.mockRejectedValueOnce(new SkillArchivedError(SKILL_ID));
            const url = `/portal/skills/${SKILL_ID}/status`;
            const skillArchived = await call('POST', url, { status: 'in_dev' });
            expect(skillArchived.status).toBe(409);
            expect(((await skillArchived.json()) as { code: string }).code).toBe(
                'PORTAL_SKILL_ARCHIVED',
            );

            changeStatus.execute.mockRejectedValueOnce(new AgentArchivedError(AGENT_ID));
            const agentArchived = await call('POST', url, { status: 'in_dev' });
            expect(agentArchived.status).toBe(409);
            expect(((await agentArchived.json()) as { code: string }).code).toBe(
                'PORTAL_AGENT_ARCHIVED',
            );
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

    describe.each(['archive', 'restore'] as const)('POST /portal/skills/:id/%s', (action) => {
        const path = `/portal/skills/${SKILL_ID}/${action}`;

        it('answers 200 with the skill', async () => {
            const response = await call('POST', path);

            expect(response.status).toBe(200);
            expect(archiveSkill[action]).toHaveBeenCalledWith(SKILL_ID);
            const body = (await response.json()) as { id: string; archivedAt: string | null };
            expect(body.id).toBe(SKILL_ID);
            expect(body.archivedAt).toBe(action === 'archive' ? '2026-11-06T12:00:00.000Z' : null);
        });

        it('answers 403 for an employee and 401 without a token', async () => {
            expect((await call('POST', path, undefined, fixture.bearer())).status).toBe(403);
            expect((await call('POST', path, undefined, {})).status).toBe(401);
            expect(archiveSkill[action]).not.toHaveBeenCalled();
        });

        it('answers 404 for an unknown skill and 400 for a malformed id', async () => {
            archiveSkill[action].mockRejectedValueOnce(new SkillNotFoundError(SKILL_ID));
            expect((await call('POST', path)).status).toBe(404);
            expect((await call('POST', `/portal/skills/nope/${action}`)).status).toBe(400);
        });
    });

    it('answers 409 when restoring a skill of an archived agent', async () => {
        archiveSkill.restore.mockRejectedValueOnce(new AgentArchivedError(AGENT_ID));
        const response = await call('POST', `/portal/skills/${SKILL_ID}/restore`);
        expect(response.status).toBe(409);
        expect(((await response.json()) as { code: string }).code).toBe('PORTAL_AGENT_ARCHIVED');
    });
});
