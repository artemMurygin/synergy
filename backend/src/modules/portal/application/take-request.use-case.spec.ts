import { describe, expect, it } from 'vitest';
import { RequestTakenEvent } from '../contracts/request-taken.event';
import {
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotFoundError,
} from '../domain/errors';
import type { RequestView } from './request-view';
import { SubmitRequestUseCase } from './submit-request.use-case';
import { TakeRequestUseCase } from './take-request.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    take: TakeRequestUseCase;
    request: RequestView;
}

async function setup(): Promise<Setup> {
    const fx = createPortalFixture();
    const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
    const take = new TakeRequestUseCase(
        fx.requests,
        fx.requestQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const request = await submit.execute({
        authorId: 'user-1',
        title: 'Моя заявка',
        description: 'Описание',
        frequency: { count: 1, period: 'day' },
        minutesPerRun: 10,
        peopleCount: 1,
    });
    return { ...fx, take, request };
}

describe('TakeRequestUseCase', () => {
    it('берёт заявку в работу, пишет событие в транзакции и возвращает вид', async () => {
        const { take, request, events, requests, clock } = await setup();

        const view = await take.execute({ requestId: request.id, reviewerId: 'dev-1' });

        expect(view.status).toEqual({ code: 'under_review', label: 'На рассмотрении' });
        expect(view.reviewer?.id).toBe('dev-1');
        expect(view.takenAt).toEqual(clock.now());
        expect(requests.byId.get(request.id)?.statusKind).toBe('under_review');
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toBeInstanceOf(RequestTakenEvent);
        expect(events.published[0]).toMatchObject({
            aggregateId: request.id,
            authorId: 'user-1',
            reviewerId: 'dev-1',
            requestTitle: 'Моя заявка',
        });
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('повторное взятие даёт 409 без второго события', async () => {
        const { take, request, events } = await setup();
        await take.execute({ requestId: request.id, reviewerId: 'dev-1' });

        await expect(
            take.execute({ requestId: request.id, reviewerId: 'dev-2' }),
        ).rejects.toBeInstanceOf(RequestAlreadyTakenError);

        expect(events.published).toHaveLength(1);
    });

    it('решённую заявку взять нельзя: 409 без события', async () => {
        const { take, request, requests, events, clock } = await setup();
        const stored = requests.byId.get(request.id);
        stored?.take('dev-1', clock.now());
        stored?.reject('нет', 'dev-1', clock.now());

        await expect(
            take.execute({ requestId: request.id, reviewerId: 'dev-2' }),
        ).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

        expect(events.published).toHaveLength(0);
    });

    it('неизвестная заявка даёт RequestNotFoundError', async () => {
        const { take, events } = await setup();

        await expect(
            take.execute({ requestId: 'nope', reviewerId: 'dev-1' }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);

        expect(events.published).toHaveLength(0);
    });
});
