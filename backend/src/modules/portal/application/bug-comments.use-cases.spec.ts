import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { BugCommentPostedEvent } from '../contracts/bug-comment-posted.event';
import { BugNotFoundError } from '../domain/errors';
import { type BugCommentFixture, createBugCommentFixture } from './bug-comment-test-doubles';
import { ListBugCommentsUseCase } from './list-bug-comments.use-case';
import { PostBugCommentUseCase } from './post-bug-comment.use-case';

const BUG_ID = 'bug-1';
const AUTHOR = { actorId: 'author', roles: ['employee'] };
const DEV = { actorId: 'dev', roles: ['developer'] };
const STRANGER = { actorId: 'stranger', roles: ['employee'] };
const minutes = (n: number): number => n * 60 * 1000;

interface Setup extends BugCommentFixture {
    list: ListBugCommentsUseCase;
    post: PostBugCommentUseCase;
}

function setup(): Setup {
    const fx = createBugCommentFixture();
    fx.addBug(BUG_ID, 'author');
    return {
        ...fx,
        list: new ListBugCommentsUseCase(fx.bugs, fx.commentQuery, fx.clock),
        post: new PostBugCommentUseCase(
            fx.bugs,
            fx.comments,
            fx.commentQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
    };
}

describe('PostBugCommentUseCase', () => {
    it('автор добавляет комментарий: canEdit true, событие в той же транзакции', async () => {
        const s = setup();

        const view = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: '  Привет  ' });

        expect(view.body).toBe('Привет');
        expect(view.canEdit).toBe(true);
        expect(view.authorRole).toBe('bug_author');
        expect(view.editedAt).toBeNull();
        expect(s.comments.byId.size).toBe(1);
        const event = s.events.published.at(-1);
        expect(event).toBeInstanceOf(BugCommentPostedEvent);
        const posted = event as BugCommentPostedEvent;
        expect(posted.commentId).toBe(view.id);
        expect(posted.bugId).toBe(BUG_ID);
        expect(posted.bugAuthorId).toBe('author');
        expect(posted.commenterId).toBe('author');
        expect(posted.bugTitle).toBe('Сломалось');
        expect(posted.excerpt).toBe('Привет');
        expect(s.events.publishedInTransaction.at(-1)).toBe(true);
    });

    it('разработчик комментирует: метка developer', async () => {
        const s = setup();

        const view = await s.post.execute({ bugId: BUG_ID, ...DEV, body: 'Вопрос' });

        expect(view.authorRole).toBe('developer');
        expect((s.events.published.at(-1) as BugCommentPostedEvent).commenterId).toBe('dev');
    });

    it('excerpt обрезается до 200 символов с «…»', async () => {
        const s = setup();

        await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'a'.repeat(500) });

        const excerpt = (s.events.published.at(-1) as BugCommentPostedEvent).excerpt;
        expect(excerpt).toHaveLength(200);
        expect(excerpt.endsWith('…')).toBe(true);
    });

    it('чужой и несуществующий баг дают BugNotFoundError без записи', async () => {
        const s = setup();

        await expect(
            s.post.execute({ bugId: BUG_ID, ...STRANGER, body: 'x' }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
        await expect(
            s.post.execute({ bugId: 'nope', ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
        expect(s.comments.byId.size).toBe(0);
        expect(s.events.published).toEqual([]);
    });

    it.each([['   '], ['a'.repeat(4001)]])(
        'невалидный текст -> ArgumentInvalidError',
        async (body) => {
            const s = setup();

            await expect(s.post.execute({ bugId: BUG_ID, ...AUTHOR, body })).rejects.toBeInstanceOf(
                ArgumentInvalidError,
            );
            expect(s.comments.byId.size).toBe(0);
            expect(s.events.published).toEqual([]);
        },
    );

    it('ошибка публикации откатывает комментарий', async () => {
        const s = setup();
        s.events.publish = (): Promise<void> => Promise.reject(new Error('outbox down'));

        await expect(s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'x' })).rejects.toThrow(
            'outbox down',
        );

        expect(s.comments.byId.size).toBe(0);
    });
});

describe('ListBugCommentsUseCase', () => {
    it('лента по порядку, canEdit по окну и автору', async () => {
        const s = setup();
        const t0 = new Date('2026-02-01T10:00:00Z');
        s.clock.set(t0);
        await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'старый' });
        s.clock.set(new Date(t0.getTime() + minutes(16)));
        await s.post.execute({ bugId: BUG_ID, ...DEV, body: 'чужой' });
        s.clock.set(new Date(t0.getTime() + minutes(17)));
        await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'свежий' });

        s.clock.set(new Date(t0.getTime() + minutes(20)));
        let items = await s.list.execute({ bugId: BUG_ID, ...AUTHOR });
        expect(items.map((i) => [i.body, i.canEdit])).toEqual([
            ['старый', false],
            ['чужой', false],
            ['свежий', true],
        ]);

        s.clock.set(new Date(t0.getTime() + minutes(5)));
        items = await s.list.execute({ bugId: BUG_ID, ...AUTHOR });
        expect(items[0]?.canEdit).toBe(true);
    });

    it('нет бага или нет доступа -> BugNotFoundError; разработчик видит пустую ленту', async () => {
        const s = setup();

        await expect(s.list.execute({ bugId: BUG_ID, ...STRANGER })).rejects.toBeInstanceOf(
            BugNotFoundError,
        );
        await expect(s.list.execute({ bugId: 'nope', ...AUTHOR })).rejects.toBeInstanceOf(
            BugNotFoundError,
        );
        await expect(s.list.execute({ bugId: BUG_ID, ...DEV })).resolves.toEqual([]);
    });
});
