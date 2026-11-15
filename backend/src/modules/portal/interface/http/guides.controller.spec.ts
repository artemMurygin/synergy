import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetAgentGuideUseCase } from '../../application/get-agent-guide.use-case';
import { SaveAgentGuideUseCase } from '../../application/save-agent-guide.use-case';
import { AgentArchivedError, AgentNotFoundError } from '../../domain/errors';
import { GuidesController } from './guides.controller';
import { saveGuideSchema } from './guides.schemas';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const AGENT_ID = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const PATH = `/portal/agents/${AGENT_ID}/guide`;

const getGuide = { execute: vi.fn() };
const saveGuide = { execute: vi.fn() };

const view = {
    body: '# Инструкция',
    updatedAt: new Date('2026-11-10T09:00:00.000Z'),
    updatedBy: { id: USER_ID, login: 'dev', fullName: 'Иван Разработчик' },
};
const json = (): Record<string, string> => ({ 'content-type': 'application/json' });

describe('GuidesController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [GuidesController],
            providers: [
                { provide: GetAgentGuideUseCase, useValue: getGuide },
                { provide: SaveAgentGuideUseCase, useValue: saveGuide },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        getGuide.execute.mockResolvedValue(view);
        saveGuide.execute.mockResolvedValue(view);
    });

    function put(
        body: unknown,
        headers = fixture.bearer(['developer']),
        path = PATH,
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, {
            method: 'PUT',
            headers: { ...headers, ...json() },
            body: JSON.stringify(body),
        });
    }

    describe('GET /portal/agents/:id/guide', () => {
        it('returns the guide to any signed-in user', async () => {
            const response = await fetch(`${fixture.base}${PATH}`, { headers: fixture.bearer() });

            expect(response.status).toBe(200);
            expect(getGuide.execute).toHaveBeenCalledWith({ agentId: AGENT_ID });
            expect(await response.json()).toEqual({
                body: '# Инструкция',
                updatedAt: '2026-11-10T09:00:00.000Z',
                updatedBy: { id: USER_ID, login: 'dev', fullName: 'Иван Разработчик' },
            });
        });

        it('returns null fields for an agent without a guide', async () => {
            getGuide.execute.mockResolvedValue({ body: null, updatedAt: null, updatedBy: null });
            const response = await fetch(`${fixture.base}${PATH}`, { headers: fixture.bearer() });

            expect(await response.json()).toEqual({ body: null, updatedAt: null, updatedBy: null });
        });

        it('answers 401 without a token, 404 for an unknown agent or a malformed id', async () => {
            expect((await fetch(`${fixture.base}${PATH}`)).status).toBe(401);
            getGuide.execute.mockRejectedValueOnce(new AgentNotFoundError(AGENT_ID));
            expect(
                (await fetch(`${fixture.base}${PATH}`, { headers: fixture.bearer() })).status,
            ).toBe(404);
            getGuide.execute.mockRejectedValueOnce(new AgentNotFoundError('nope'));
            const bad = await fetch(`${fixture.base}/portal/agents/nope/guide`, {
                headers: fixture.bearer(),
            });
            expect(bad.status).toBe(404);
        });
    });

    describe('PUT /portal/agents/:id/guide', () => {
        it('saves the guide for a developer, passing the actor', async () => {
            const response = await put({ body: '# Инструкция' });

            expect(response.status).toBe(200);
            expect(saveGuide.execute).toHaveBeenCalledWith({
                agentId: AGENT_ID,
                actorId: USER_ID,
                body: '# Инструкция',
            });
            expect(((await response.json()) as { updatedAt: string }).updatedAt).toBe(
                '2026-11-10T09:00:00.000Z',
            );
        });

        it('accepts an empty body (deletes the guide)', async () => {
            expect((await put({ body: '' })).status).toBe(200);
        });

        it('answers 403 for an employee and 401 without a token', async () => {
            expect((await put({ body: 'x' }, fixture.bearer())).status).toBe(403);
            expect((await put({ body: 'x' }, {})).status).toBe(401);
            expect(saveGuide.execute).not.toHaveBeenCalled();
        });

        it('answers 400 for a body over 200000 characters or a wrong shape', async () => {
            expect((await put({})).status).toBe(400);
            expect((await put({ body: 5 })).status).toBe(400);
            expect(saveGuide.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for a malformed id (the use case reports the agent as not found)', async () => {
            saveGuide.execute.mockRejectedValueOnce(new AgentNotFoundError('nope'));
            const response = await put(
                { body: 'x' },
                fixture.bearer(['developer']),
                '/portal/agents/nope/guide',
            );
            expect(response.status).toBe(404);
            expect(saveGuide.execute).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'nope' }));
        });

        it('limits the schema to 200000 characters (the HTTP body parser limit applies earlier)', () => {
            expect(saveGuideSchema.safeParse({ body: 'a'.repeat(200000) }).success).toBe(true);
            expect(saveGuideSchema.safeParse({ body: 'a'.repeat(200001) }).success).toBe(false);
        });

        it('accepts a large body within the HTTP body parser limit', async () => {
            expect((await put({ body: 'a'.repeat(90000) })).status).toBe(200);
        });

        it('answers 404 for an unknown agent and 409 for an archived one', async () => {
            saveGuide.execute.mockRejectedValueOnce(new AgentNotFoundError(AGENT_ID));
            expect((await put({ body: 'x' })).status).toBe(404);
            saveGuide.execute.mockRejectedValueOnce(new AgentArchivedError(AGENT_ID));
            const response = await put({ body: 'x' });
            expect(response.status).toBe(409);
            expect(((await response.json()) as { code: string }).code).toBe(
                'PORTAL_AGENT_ARCHIVED',
            );
        });
    });
});
