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
    it('возвращает только pending, старые первыми, с пагинацией', async () => {
        const fx = createPortalFixture();
        const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
        const queue = new ListQueueUseCase(fx.requestQuery);
        const ids: string[] = [];
        for (const day of [3, 1, 2]) {
            fx.clock.set(new Date(`2026-02-0${String(day)}T10:00:00Z`));
            ids[day] = (await submit.execute({ ...base, title: `D${String(day)}` })).id;
        }
        const decided = await submit.execute({ ...base, title: 'Решённая' });
        fx.requests.byId.get(decided.id)?.reject('нет', 'dev-1', fx.clock.now());

        const all = await queue.execute({ limit: 10, page: 0 });
        expect(all.items.map((item) => item.id)).toEqual([ids[1], ids[2], ids[3]]);
        expect(all.total).toBe(3);

        const second = await queue.execute({ limit: 2, page: 1 });
        expect(second.items.map((item) => item.id)).toEqual([ids[3]]);
        expect(second.total).toBe(3);
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
        expect(result[0]?.product.name).toBe('Control Center');
    });
});
