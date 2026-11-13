import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { RequestRejectedEvent } from '../contracts/request-rejected.event';
import { RequestAlreadyDecidedError, RequestNotFoundError } from '../domain/errors';
import { RejectRequestUseCase } from './reject-request.use-case';
import { SubmitRequestUseCase } from './submit-request.use-case';
import type { RequestView } from './request-view';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    reject: RejectRequestUseCase;
    request: RequestView;
}

async function setup(): Promise<Setup> {
    const fx = createPortalFixture();
    const submit = new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock);
    const reject = new RejectRequestUseCase(
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
    return { ...fx, reject, request };
}

describe('RejectRequestUseCase', () => {
    it('отклоняет заявку с причиной и пишет событие один раз', async () => {
        const { reject, request, events } = await setup();

        const view = await reject.execute({
            requestId: request.id,
            decidedBy: 'dev-1',
            reason: ' Дублирует существующий навык ',
        });

        expect(view.status).toEqual({ code: 'rejected', label: 'Отклонена' });
        expect(view.rejectReason).toBe('Дублирует существующий навык');
        expect(events.published).toHaveLength(1);
        expect(events.published[0]).toBeInstanceOf(RequestRejectedEvent);
        expect(events.published[0]).toMatchObject({
            aggregateId: request.id,
            authorId: 'user-1',
            decidedBy: 'dev-1',
            reason: 'Дублирует существующий навык',
            requestTitle: 'Моя заявка',
        });
        expect(events.publishedInTransaction).toEqual([true]);
    });

    it('требует причину: пустая даёт 400, заявка остаётся pending, события нет', async () => {
        const { reject, request, requests, events } = await setup();

        await expect(
            reject.execute({ requestId: request.id, decidedBy: 'dev-1', reason: '   ' }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);

        expect(requests.byId.get(request.id)?.decision.kind).toBe('pending');
        expect(events.published).toHaveLength(0);
    });

    it('повторное отклонение даёт 409 без второго события', async () => {
        const { reject, request, events } = await setup();
        await reject.execute({ requestId: request.id, decidedBy: 'dev-1', reason: 'Нет' });

        await expect(
            reject.execute({ requestId: request.id, decidedBy: 'dev-2', reason: 'Снова' }),
        ).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

        expect(events.published).toHaveLength(1);
    });

    it('принятую заявку отклонить нельзя: 409 без события', async () => {
        const { reject, request, requests, clock, events } = await setup();
        requests.byId.get(request.id)?.accept('skill-1', 'dev-1', clock.now());

        await expect(
            reject.execute({ requestId: request.id, decidedBy: 'dev-2', reason: 'Поздно' }),
        ).rejects.toBeInstanceOf(RequestAlreadyDecidedError);

        expect(requests.byId.get(request.id)?.decision.kind).toBe('accepted');
        expect(events.published).toHaveLength(0);
    });

    it('неизвестная заявка даёт RequestNotFoundError', async () => {
        const { reject } = await setup();

        await expect(
            reject.execute({ requestId: 'nope', decidedBy: 'dev-1', reason: 'Нет' }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);
    });
});
