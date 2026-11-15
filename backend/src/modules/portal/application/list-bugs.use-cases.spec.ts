import { describe, expect, it } from 'vitest';
import { BugReport } from '../domain/bug-report';
import { BugDescription } from '../domain/bug-description';
import { BugTitle } from '../domain/bug-title';
import { ListBugQueueUseCase } from './list-bug-queue.use-case';
import { ListMyBugsUseCase } from './list-my-bugs.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

function seed(fx: PortalFixture): (id: string, authorId: string, minute: number) => Promise<void> {
    const add = (id: string, authorId: string, minute: number): Promise<void> =>
        fx.bugs.insert(
            BugReport.report({
                id,
                authorId,
                productId: 'p',
                agentId: 'a',
                title: BugTitle.of(id),
                description: BugDescription.of('d'),
                now: new Date(Date.UTC(2026, 1, 1, 10, minute)),
            }),
        );
    return add;
}

describe('ListMyBugsUseCase', () => {
    it('передаёт автора и страницу в BugQuery и возвращает только свои, новые первыми', async () => {
        const fx = createPortalFixture();
        const add = seed(fx);
        await add('b1', 'me', 1);
        await add('b2', 'me', 2);
        await add('b3', 'other', 3);
        const page = await new ListMyBugsUseCase(fx.bugQuery).execute({
            authorId: 'me',
            page: { page: 0, limit: 10 },
        });
        expect(fx.bugQuery.calls).toEqual([
            { method: 'listByAuthor', args: ['me', { page: 0, limit: 10 }] },
        ]);
        expect(page.items.map((b) => b.id)).toEqual(['b2', 'b1']);
        expect(page.total).toBe(2);
    });
});

describe('ListBugQueueUseCase', () => {
    it('передаёт фильтр и страницу в BugQuery', async () => {
        const fx = createPortalFixture();
        const add = seed(fx);
        await add('b1', 'me', 1);
        const useCase = new ListBugQueueUseCase(fx.bugQuery);
        const page = await useCase.execute({ status: null, page: { page: 1, limit: 5 } });
        await useCase.execute({ status: 'resolved', page: { page: 0, limit: 5 } });
        expect(fx.bugQuery.calls).toEqual([
            { method: 'listQueue', args: [null, { page: 1, limit: 5 }] },
            { method: 'listQueue', args: ['resolved', { page: 0, limit: 5 }] },
        ]);
        expect(page.total).toBe(1);
    });
});
