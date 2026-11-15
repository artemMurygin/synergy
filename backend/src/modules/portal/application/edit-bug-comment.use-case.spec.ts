import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import {
    BugNotFoundError,
    CommentEditWindowExpiredError,
    CommentNotFoundError,
    CommentNotOwnedError,
} from '../domain/errors';
import { type BugCommentFixture, createBugCommentFixture } from './bug-comment-test-doubles';
import { EditBugCommentUseCase } from './edit-bug-comment.use-case';
import { PostBugCommentUseCase } from './post-bug-comment.use-case';

const BUG_ID = 'bug-1';
const OTHER_BUG_ID = 'bug-2';
const AUTHOR = { actorId: 'author', roles: ['employee'] };
const DEV = { actorId: 'dev', roles: ['developer'] };
const STRANGER = { actorId: 'stranger', roles: ['employee'] };
const minutes = (n: number): number => n * 60 * 1000;

interface Setup extends BugCommentFixture {
    post: PostBugCommentUseCase;
    edit: EditBugCommentUseCase;
}

function setup(): Setup {
    const fx = createBugCommentFixture();
    fx.addBug(BUG_ID, 'author');
    fx.addBug(OTHER_BUG_ID, 'author');
    return {
        ...fx,
        post: new PostBugCommentUseCase(
            fx.bugs,
            fx.comments,
            fx.commentQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
        edit: new EditBugCommentUseCase(fx.bugs, fx.comments, fx.commentQuery, fx.clock),
    };
}

describe('EditBugCommentUseCase', () => {
    it('автор правит в окне: тело и editedAt, без событий', async () => {
        const s = setup();
        const created = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'до' });
        const eventsBefore = s.events.published.length;
        s.clock.set(new Date(s.clock.now().getTime() + minutes(5)));

        const view = await s.edit.execute({
            bugId: BUG_ID,
            commentId: created.id,
            ...AUTHOR,
            body: ' после ',
        });

        expect(view.body).toBe('после');
        expect(view.editedAt).toEqual(s.clock.now());
        expect(view.canEdit).toBe(true);
        expect(s.events.published).toHaveLength(eventsBefore);
    });

    it('чужой комментарий -> CommentNotOwnedError', async () => {
        const s = setup();
        const created = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ bugId: BUG_ID, commentId: created.id, ...DEV, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotOwnedError);
    });

    it('окно истекло -> CommentEditWindowExpiredError', async () => {
        const s = setup();
        const created = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'до' });
        s.clock.set(new Date(s.clock.now().getTime() + minutes(16)));

        await expect(
            s.edit.execute({ bugId: BUG_ID, commentId: created.id, ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentEditWindowExpiredError);
    });

    it('нет комментария или другой баг -> CommentNotFoundError; нет доступа -> BugNotFoundError', async () => {
        const s = setup();
        const created = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ bugId: BUG_ID, commentId: 'nope', ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotFoundError);
        await expect(
            s.edit.execute({ bugId: OTHER_BUG_ID, commentId: created.id, ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotFoundError);
        await expect(
            s.edit.execute({ bugId: BUG_ID, commentId: created.id, ...STRANGER, body: 'x' }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
        await expect(
            s.edit.execute({ bugId: 'nope', commentId: created.id, ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(BugNotFoundError);
    });

    it('невалидный текст -> ArgumentInvalidError, комментарий не меняется', async () => {
        const s = setup();
        const created = await s.post.execute({ bugId: BUG_ID, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ bugId: BUG_ID, commentId: created.id, ...AUTHOR, body: ' ' }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        expect(s.comments.byId.get(created.id)?.body.value).toBe('до');
    });
});
