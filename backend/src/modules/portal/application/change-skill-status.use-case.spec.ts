import { describe, expect, it, vi } from 'vitest';
import { SkillStatusChangedEvent } from '../contracts/skill-status-changed.event';
import { Frequency } from '../domain/frequency';
import { IdeaRequest } from '../domain/idea-request';
import { InvalidSkillTransitionError, SkillNotFoundError } from '../domain/errors';
import { RequestTitle } from '../domain/request-title';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import type { SkillStatus } from '../domain/skill-status';
import { ChangeSkillStatusUseCase } from './change-skill-status.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    change: ChangeSkillStatusUseCase;
    skill: Skill;
    link: (id: string, authorId: string) => Promise<void>;
}

async function setup(initial: SkillStatus = 'planned'): Promise<Setup> {
    const fx = createPortalFixture();
    fx.catalog.addProduct('control-center', 'Control Center');
    const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');
    const skill = Skill.restore({
        id: 'skill-1',
        agentId: agent.id,
        name: SkillName.of('Навык'),
        description: '',
        status: initial,
        statusChangedAt: new Date('2026-01-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await fx.skills.save(skill);
    const change = new ChangeSkillStatusUseCase(
        fx.skills,
        fx.requests,
        fx.skillQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const link = async (id: string, authorId: string): Promise<void> => {
        const request = IdeaRequest.create({
            id,
            authorId,
            title: RequestTitle.of(`Заявка ${id}`),
            description: 'D',
            frequency: Frequency.of(1, 'day'),
            minutesPerRun: 1,
            peopleCount: 1,
            now: fx.clock.now(),
        });
        request.accept(skill.id, 'dev-1', fx.clock.now());
        await fx.requests.save(request);
    };
    return { ...fx, change, skill, link };
}

describe('ChangeSkillStatusUseCase', () => {
    it('переводит вперёд, обновляет statusChangedAt и пишет событие со снимком двух авторов', async () => {
        const { change, link, clock, events, skills, skill } = await setup();
        await link('r1', 'user-1');
        await link('r2', 'user-2');
        const later = new Date('2026-03-01T09:00:00Z');
        clock.set(later);

        const view = await change.execute({ skillId: skill.id, to: 'in_dev', changedBy: 'dev-1' });

        expect(view.status).toBe('in_dev');
        expect(view.statusChangedAt).toEqual(later);
        expect(view.linkedRequestCount).toBe(2);
        expect(skills.lockedIds).toEqual([skill.id]);
        expect(events.published).toHaveLength(1);
        const event = events.published[0];
        expect(event).toBeInstanceOf(SkillStatusChangedEvent);
        expect(event).toMatchObject({
            aggregateId: skill.id,
            skillName: 'Навык',
            from: 'planned',
            to: 'in_dev',
            changedBy: 'dev-1',
        });
        expect((event as SkillStatusChangedEvent).linked).toEqual([
            { requestId: 'r1', authorId: 'user-1', title: 'Заявка r1' },
            { requestId: 'r2', authorId: 'user-2', title: 'Заявка r2' },
        ]);
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('навык без заявок даёт событие с пустым снимком', async () => {
        const { change, events, skill } = await setup();

        await change.execute({ skillId: skill.id, to: 'in_dev', changedBy: 'dev-1' });

        expect((events.published[0] as SkillStatusChangedEvent).linked).toEqual([]);
    });

    it.each<[string, SkillStatus, SkillStatus]>([
        ['пропуск', 'planned', 'testing'],
        ['возврат', 'testing', 'in_dev'],
        ['повтор', 'in_dev', 'in_dev'],
        ['выход из launched', 'launched', 'testing'],
    ])('отвергает %s (409) без изменений и без события', async (_name, from, to) => {
        const { change, events, skills, skill } = await setup(from);

        await expect(
            change.execute({ skillId: skill.id, to, changedBy: 'dev-1' }),
        ).rejects.toBeInstanceOf(InvalidSkillTransitionError);

        expect(skills.byId.get(skill.id)?.status).toBe(from);
        expect(events.published).toHaveLength(0);
    });

    it('неизвестный навык даёт SkillNotFoundError', async () => {
        const { change, events } = await setup();

        await expect(
            change.execute({ skillId: 'nope', to: 'in_dev', changedBy: 'dev-1' }),
        ).rejects.toBeInstanceOf(SkillNotFoundError);
        expect(events.published).toHaveLength(0);
    });

    it('проигранная гонка по условному UPDATE даёт 409 без события', async () => {
        const { change, events, skills, skill } = await setup();
        // Другой писатель уже перевёл навык, а мы прочитали устаревшее состояние.
        const stale = Skill.restore({
            id: skill.id,
            agentId: skill.agentId,
            name: skill.name,
            description: '',
            status: 'planned',
            statusChangedAt: skill.statusChangedAt,
            createdAt: skill.createdAt,
            updatedAt: skill.updatedAt,
        });
        skill.advance('in_dev', new Date('2026-02-01T00:00:00Z'));
        await skills.save(skill);
        vi.spyOn(skills, 'findForUpdate').mockResolvedValueOnce(stale);

        await expect(
            change.execute({ skillId: skill.id, to: 'in_dev', changedBy: 'dev-1' }),
        ).rejects.toBeInstanceOf(InvalidSkillTransitionError);

        expect(events.published).toHaveLength(0);
    });
});
