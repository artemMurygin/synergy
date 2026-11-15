import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { RequestNotFoundError } from '../domain/errors';
import { GetRequestUseCase } from './get-request.use-case';
import { ListMyRequestsUseCase } from './list-my-requests.use-case';
import { SubmitRequestUseCase, type SubmitRequestInput } from './submit-request.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    submit: SubmitRequestUseCase;
    listMine: ListMyRequestsUseCase;
    get: GetRequestUseCase;
}

function setup(): Setup {
    const fx = createPortalFixture();
    return {
        ...fx,
        submit: new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock),
        listMine: new ListMyRequestsUseCase(fx.requestQuery),
        get: new GetRequestUseCase(fx.requestQuery),
    };
}

const valid: SubmitRequestInput = {
    authorId: 'user-1',
    title: '  Сводка по сделкам ',
    description: 'Каждый понедельник собираю сводку вручную',
    frequency: { count: 1, period: 'week' },
    minutesPerRun: 45,
    peopleCount: 3,
};

describe('SubmitRequestUseCase', () => {
    it('создаёт заявку на рассмотрении от имени автора из токена', async () => {
        const { submit, requests } = setup();

        const view = await submit.execute(valid);

        expect(view.authorId).toBe('user-1');
        expect(view.title).toBe('Сводка по сделкам');
        expect(view.status).toEqual({ code: 'new', label: 'Новая' });
        expect(view.skill).toBeNull();
        expect(requests.byId.get(view.id)?.authorId).toBe('user-1');
    });

    it.each([
        ['пустое название', { title: '   ' }],
        ['пустое описание', { description: ' ' }],
        ['частота не целая', { frequency: { count: 1.5, period: 'week' } }],
        ['неизвестный период', { frequency: { count: 1, period: 'year' } }],
        ['минуты не больше нуля', { minutesPerRun: 0 }],
        ['люди не целые', { peopleCount: 2.5 }],
    ])('отвергает недопустимое значение (%s) без создания', async (_name, patch) => {
        const { submit, requests } = setup();

        await expect(submit.execute({ ...valid, ...patch })).rejects.toBeInstanceOf(
            ArgumentInvalidError,
        );

        expect(requests.byId.size).toBe(0);
    });
});

describe('ListMyRequestsUseCase', () => {
    it('возвращает только свои заявки, новые первыми, с total', async () => {
        const { submit, listMine, clock } = setup();
        clock.set(new Date('2026-02-01T10:00:00Z'));
        const first = await submit.execute({ ...valid, title: 'Первая' });
        clock.set(new Date('2026-02-02T10:00:00Z'));
        const second = await submit.execute({ ...valid, title: 'Вторая' });
        await submit.execute({ ...valid, authorId: 'user-2', title: 'Чужая' });

        const page = await listMine.execute({ authorId: 'user-1', limit: 10, page: 0 });

        expect(page.items.map((item) => item.id)).toEqual([second.id, first.id]);
        expect(page.total).toBe(2);
    });

    it('учитывает пагинацию, total остаётся полным', async () => {
        const { submit, listMine } = setup();
        for (const title of ['A', 'B', 'C']) await submit.execute({ ...valid, title });

        const page = await listMine.execute({ authorId: 'user-1', limit: 2, page: 1 });

        expect(page.items).toHaveLength(1);
        expect(page.total).toBe(3);
    });
});

describe('GetRequestUseCase', () => {
    it('отдаёт заявку автору', async () => {
        const { submit, get } = setup();
        const created = await submit.execute(valid);

        const view = await get.execute({ actorId: 'user-1', roles: [], requestId: created.id });

        expect(view.id).toBe(created.id);
    });

    it('отдаёт любую заявку разработчику', async () => {
        const { submit, get } = setup();
        const created = await submit.execute(valid);

        const view = await get.execute({
            actorId: 'dev-1',
            roles: ['developer'],
            requestId: created.id,
        });

        expect(view.id).toBe(created.id);
    });

    it('отдаёт разработчику автора с идентификатором, логином и полным именем', async () => {
        const { submit, get, requestQuery } = setup();
        requestQuery.logins.set('user-1', 'ivan');
        requestQuery.profiles.set('user-1', { lastName: 'Иванов', firstName: 'Иван' });
        const created = await submit.execute(valid);

        const view = await get.execute({
            actorId: 'dev-1',
            roles: ['developer'],
            requestId: created.id,
        });

        expect(view).toMatchObject({
            authorId: 'user-1',
            authorLogin: 'ivan',
            authorFullName: 'Иванов Иван',
        });
    });

    it('для автора без ФИО полное имя равно логину', async () => {
        const { submit, get, requestQuery } = setup();
        requestQuery.logins.set('user-1', 'ivan');
        const created = await submit.execute(valid);

        const view = await get.execute({
            actorId: 'dev-1',
            roles: ['developer'],
            requestId: created.id,
        });

        expect(view.authorFullName).toBe('ivan');
    });

    it('«Мои заявки» отдают автора с полным именем', async () => {
        const { submit, listMine, requestQuery } = setup();
        requestQuery.logins.set('user-1', 'ivan');
        requestQuery.profiles.set('user-1', { lastName: 'Иванов', firstName: 'Иван' });
        await submit.execute(valid);

        const page = await listMine.execute({ authorId: 'user-1', limit: 10, page: 0 });

        expect(page.items[0]?.authorFullName).toBe('Иванов Иван');
    });

    it('скрывает чужую заявку от остальных как несуществующую', async () => {
        const { submit, get } = setup();
        const created = await submit.execute(valid);

        await expect(
            get.execute({ actorId: 'user-2', roles: [], requestId: created.id }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);
    });

    it('отвечает RequestNotFoundError на неизвестный id', async () => {
        const { get } = setup();

        await expect(
            get.execute({ actorId: 'dev-1', roles: ['developer'], requestId: 'nope' }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);
    });
});
