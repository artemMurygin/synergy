import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { BugStatusChangedEvent } from '../contracts/bug-status-changed.event';
import { BugNotFoundError, InvalidBugTransitionError } from '../domain/errors';
import { ChangeBugStatusUseCase } from './change-bug-status.use-case';
import type { BugView } from './bug-view';
import { ReportBugUseCase } from './report-bug.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

async function setup(): Promise<{
    fx: PortalFixture;
    bug: BugView;
    change: ChangeBugStatusUseCase;
    base: { bugId: string; actorId: string; roles: string[] };
}> {
    const fx = createPortalFixture();
    const product = fx.catalog.addProduct('crm', 'CRM');
    const agent = fx.catalog.addAgent('crm', 'helper', 'Помощник');
    const bug = await new ReportBugUseCase(
        fx.bugs,
        fx.catalog,
        fx.bugQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    ).execute({
        actorId: 'author',
        roles: [],
        title: 'Заголовок',
        description: 'D',
        productId: product.id,
        agentId: agent.id,
    });
    fx.events.published = [];
    fx.events.publishedInTransaction.length = 0;
    const change = new ChangeBugStatusUseCase(
        fx.bugs,
        fx.bugQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const base = { bugId: bug.id, actorId: 'dev', roles: ['developer'] };
    return { fx, bug, change, base };
}

describe('ChangeBugStatusUseCase', () => {
    it('меняет статус и публикует событие с from/to/reason в транзакции', async () => {
        const { fx, bug, change, base } = await setup();
        const view = await change.execute({ ...base, status: 'in_progress', reason: null });
        expect(view.status).toBe('in_progress');
        expect(view.statusChangedBy?.id).toBe('dev');
        expect(view.nextStatuses).toEqual(['resolved', 'wont_fix', 'open']);
        const [event] = fx.events.published;
        expect(event).toBeInstanceOf(BugStatusChangedEvent);
        expect(event).toMatchObject({
            bugId: bug.id,
            authorId: 'author',
            changedBy: 'dev',
            title: 'Заголовок',
            from: 'open',
            to: 'in_progress',
            reason: null,
        });
        expect(fx.events.publishedInTransaction).toEqual([true]);
    });

    it('wont_fix с причиной сохраняет её (trim) и кладёт в событие', async () => {
        const { fx, change, base } = await setup();
        const view = await change.execute({ ...base, status: 'wont_fix', reason: '  не баг  ' });
        expect(view.wontFixReason).toBe('не баг');
        expect(fx.events.published[0]).toMatchObject({ to: 'wont_fix', reason: 'не баг' });
    });

    it('при других переходах reason игнорируется', async () => {
        const { fx, change, base } = await setup();
        await change.execute({ ...base, status: 'in_progress', reason: 'лишнее' });
        expect(fx.events.published[0]).toMatchObject({ reason: null });
    });

    it('уход из wont_fix очищает причину', async () => {
        const { change, base } = await setup();
        await change.execute({ ...base, status: 'wont_fix', reason: 'нет' });
        const view = await change.execute({ ...base, status: 'in_progress', reason: null });
        expect(view.wontFixReason).toBeNull();
    });

    it('неизвестный баг даёт BugNotFoundError', async () => {
        const { change, base } = await setup();
        await expect(
            change.execute({ ...base, bugId: 'nope', status: 'in_progress', reason: null }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
    });

    it('wont_fix без причины даёт ArgumentInvalidError и не меняет баг', async () => {
        const { fx, bug, change, base } = await setup();
        await expect(
            change.execute({ ...base, status: 'wont_fix', reason: '  ' }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        await expect(
            change.execute({ ...base, status: 'wont_fix', reason: null }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        expect(fx.bugs.byId.get(bug.id)?.status).toBe('open');
        expect(fx.events.published).toEqual([]);
    });

    it('недопустимый переход даёт InvalidBugTransitionError', async () => {
        const { fx, change, base } = await setup();
        await expect(
            change.execute({ ...base, status: 'resolved', reason: null }),
        ).rejects.toBeInstanceOf(InvalidBugTransitionError);
        expect(fx.events.published).toEqual([]);
    });

    it('проигранная гонка (updateStatus -> false) даёт InvalidBugTransitionError без события', async () => {
        const { fx, change, base } = await setup();
        fx.bugs.updateStatus = () => Promise.resolve(false);
        await expect(
            change.execute({ ...base, status: 'in_progress', reason: null }),
        ).rejects.toBeInstanceOf(InvalidBugTransitionError);
        expect(fx.events.published).toEqual([]);
    });
});
