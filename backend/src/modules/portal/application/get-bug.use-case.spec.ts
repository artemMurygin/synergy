import { describe, expect, it } from 'vitest';
import { BugNotFoundError } from '../domain/errors';
import { GetBugUseCase } from './get-bug.use-case';
import { ReportBugUseCase } from './report-bug.use-case';
import type { BugView } from './bug-view';
import { createPortalFixture, type PortalFixture } from './test-doubles';

async function setup(): Promise<{
    fx: PortalFixture;
    bug: BugView;
    get: GetBugUseCase;
}> {
    const fx = createPortalFixture();
    const product = fx.catalog.addProduct('crm', 'CRM');
    const agent = fx.catalog.addAgent('crm', 'helper', 'Помощник');
    const report = new ReportBugUseCase(
        fx.bugs,
        fx.catalog,
        fx.bugQuery,
        fx.clock,
        fx.transactions,
        fx.events,
    );
    const bug = await report.execute({
        actorId: 'author',
        roles: [],
        title: 'T',
        description: 'D',
        productId: product.id,
        agentId: agent.id,
    });
    return { fx, bug, get: new GetBugUseCase(fx.bugQuery) };
}

describe('GetBugUseCase', () => {
    it('автор видит свой баг без nextStatuses', async () => {
        const { bug, get } = await setup();
        const view = await get.execute({ bugId: bug.id, actorId: 'author', roles: [] });
        expect(view.id).toBe(bug.id);
        expect(view.nextStatuses).toEqual([]);
    });

    it('developer видит чужой баг с nextStatuses по политике', async () => {
        const { bug, get } = await setup();
        const view = await get.execute({ bugId: bug.id, actorId: 'dev', roles: ['developer'] });
        expect(view.nextStatuses).toEqual(['in_progress', 'wont_fix']);
    });

    it('чужой без developer получает BugNotFoundError', async () => {
        const { bug, get } = await setup();
        await expect(
            get.execute({ bugId: bug.id, actorId: 'other', roles: ['user'] }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
    });

    it('неизвестный id даёт BugNotFoundError', async () => {
        const { get } = await setup();
        await expect(
            get.execute({ bugId: 'nope', actorId: 'dev', roles: ['developer'] }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
    });
});
