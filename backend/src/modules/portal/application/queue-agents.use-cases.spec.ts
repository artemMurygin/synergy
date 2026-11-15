import { describe, expect, it } from 'vitest';
import { ListAgentsUseCase } from './list-agents.use-case';
import { ListQueueUseCase } from './list-queue.use-case';
import { SubmitRequestUseCase } from './submit-request.use-case';
import { createPortalFixture } from './test-doubles';

const base = {
    authorId: 'user-1',
    title: 'Заявка',
    description: 'Описание',
    frequency: { count: 1, period: 'day' },
    minutesPerRun: 10,
    peopleCount: 1,
};

describe('ListQueueUseCase', () => {
    it('возвращает new и under_review, решённые не показывает', async () => {
        const fx = createPortalFixture();
        const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
        const queue = new ListQueueUseCase(fx.requestQuery);
        const fresh = await submit.execute({ ...base, title: 'Новая' });
        const taken = await submit.execute({ ...base, title: 'Взятая' });
        fx.requests.byId.get(taken.id)?.take('dev-1', fx.clock.now());
        const done = await submit.execute({ ...base, title: 'Решённая' });
        fx.requests.byId.get(done.id)?.take('dev-1', fx.clock.now());
        fx.requests.byId.get(done.id)?.reject('нет', 'dev-1', fx.clock.now());

        const page = await queue.execute({ limit: 10, page: 0 });

        expect(page.items.map((item) => [item.id, item.status.code])).toEqual([
            [fresh.id, 'new'],
            [taken.id, 'under_review'],
        ]);
        expect(page.total).toBe(2);
    });

    it('возвращает только неразрешённые, старые первыми, с пагинацией', async () => {
        const fx = createPortalFixture();
        const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
        const queue = new ListQueueUseCase(fx.requestQuery);
        const ids: string[] = [];
        for (const day of [3, 1, 2]) {
            fx.clock.set(new Date(`2026-02-0${String(day)}T10:00:00Z`));
            ids[day] = (await submit.execute({ ...base, title: `D${String(day)}` })).id;
        }
        const decided = await submit.execute({ ...base, title: 'Решённая' });
        const decidedRequest = fx.requests.byId.get(decided.id);
        decidedRequest?.take('dev-1', fx.clock.now());
        decidedRequest?.reject('нет', 'dev-1', fx.clock.now());

        const all = await queue.execute({ limit: 10, page: 0 });
        expect(all.items.map((item) => item.id)).toEqual([ids[1], ids[2], ids[3]]);
        expect(all.total).toBe(3);

        const second = await queue.execute({ limit: 2, page: 1 });
        expect(second.items.map((item) => item.id)).toEqual([ids[3]]);
        expect(second.total).toBe(3);
    });
});

describe('ListQueueUseCase: автор', () => {
    it('возвращает автору идентификатор, логин и полное имя', async () => {
        const fx = createPortalFixture();
        const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
        const queue = new ListQueueUseCase(fx.requestQuery);
        fx.requestQuery.logins.set('user-1', 'ivan');
        fx.requestQuery.profiles.set('user-1', {
            lastName: 'Иванов',
            firstName: 'Иван',
            middleName: 'Иванович',
        });
        await submit.execute(base);

        const page = await queue.execute({ limit: 10, page: 0 });

        expect(page.items[0]).toMatchObject({
            authorId: 'user-1',
            authorLogin: 'ivan',
            authorFullName: 'Иванов Иван Иванович',
        });
    });

    it('для автора без профиля полное имя равно логину', async () => {
        const fx = createPortalFixture();
        const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
        const queue = new ListQueueUseCase(fx.requestQuery);
        fx.requestQuery.logins.set('user-1', 'ivan');
        await submit.execute(base);

        const page = await queue.execute({ limit: 10, page: 0 });

        expect(page.items[0]?.authorFullName).toBe('ivan');
    });
});

describe('ListAgentsUseCase', () => {
    it('возвращает агентов вместе с продуктами', async () => {
        const fx = createPortalFixture();
        fx.catalog.addProduct('control-center', 'Control Center');
        const agent = fx.catalog.addAgent('control-center', 'tasks', 'Задачи');

        const result = await new ListAgentsUseCase(fx.catalog).execute();

        expect(result).toHaveLength(1);
        expect(result[0]?.agent.id).toBe(agent.id);
        expect(result[0]?.products[0]?.name).toBe('Control Center');
    });
});
