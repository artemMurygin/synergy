import { describe, expect, it } from 'vitest';
import { ArgumentInvalidError } from '../../../shared/errors';
import { RequestCommentPostedEvent } from '../contracts/request-comment-posted.event';
import {
    CommentEditWindowExpiredError,
    CommentNotFoundError,
    CommentNotOwnedError,
    RequestNotFoundError,
} from '../domain/errors';
import { AcceptRequestUseCase } from './accept-request.use-case';
import { EditCommentUseCase } from './edit-comment.use-case';
import { ListCommentsUseCase } from './list-comments.use-case';
import { PostCommentUseCase } from './post-comment.use-case';
import { RejectRequestUseCase } from './reject-request.use-case';
import { SubmitRequestUseCase } from './submit-request.use-case';
import { TakeRequestUseCase } from './take-request.use-case';
import { createPortalFixture, type PortalFixture } from './test-doubles';

interface Setup extends PortalFixture {
    list: ListCommentsUseCase;
    post: PostCommentUseCase;
    edit: EditCommentUseCase;
    submit: SubmitRequestUseCase;
    take: TakeRequestUseCase;
    reject: RejectRequestUseCase;
    accept: AcceptRequestUseCase;
}

function setup(): Setup {
    const fx = createPortalFixture();
    return {
        ...fx,
        list: new ListCommentsUseCase(fx.requests, fx.commentQuery, fx.clock),
        post: new PostCommentUseCase(
            fx.requests,
            fx.comments,
            fx.commentQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
        edit: new EditCommentUseCase(fx.requests, fx.comments, fx.commentQuery, fx.clock),
        submit: new SubmitRequestUseCase(fx.requests, fx.requestQuery, fx.clock),
        take: new TakeRequestUseCase(
            fx.requests,
            fx.requestQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
        reject: new RejectRequestUseCase(
            fx.requests,
            fx.requestQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
        accept: new AcceptRequestUseCase(
            fx.requests,
            fx.skills,
            fx.catalog,
            fx.requestQuery,
            fx.clock,
            fx.transactions,
            fx.events,
        ),
    };
}

const AUTHOR = { actorId: 'author', roles: ['employee'] };
const DEV = { actorId: 'dev', roles: ['developer'] };
const STRANGER = { actorId: 'stranger', roles: ['employee'] };
const minutes = (n: number): number => n * 60 * 1000;

async function newRequest(s: Setup): Promise<string> {
    const view = await s.submit.execute({
        authorId: 'author',
        title: 'Заявка',
        description: 'Описание',
        frequency: { count: 1, period: 'day' },
        minutesPerRun: 10,
        peopleCount: 1,
    });
    return view.id;
}

describe('PostCommentUseCase', () => {
    it('автор добавляет комментарий: canEdit true, событие в той же транзакции', async () => {
        const s = setup();
        const requestId = await newRequest(s);

        const view = await s.post.execute({ requestId, ...AUTHOR, body: '  Привет  ' });

        expect(view.body).toBe('Привет');
        expect(view.canEdit).toBe(true);
        expect(view.authorRole).toBe('request_author');
        expect(view.editedAt).toBeNull();
        expect(s.comments.byId.size).toBe(1);
        const event = s.events.published.at(-1);
        expect(event).toBeInstanceOf(RequestCommentPostedEvent);
        const posted = event as RequestCommentPostedEvent;
        expect(posted.commentId).toBe(view.id);
        expect(posted.requestId).toBe(requestId);
        expect(posted.requestAuthorId).toBe('author');
        expect(posted.commenterId).toBe('author');
        expect(posted.requestTitle).toBe('Заявка');
        expect(posted.excerpt).toBe('Привет');
        expect(s.events.publishedInTransaction.at(-1)).toBe(true);
    });

    it('разработчик комментирует: метка developer', async () => {
        const s = setup();
        const requestId = await newRequest(s);

        const view = await s.post.execute({ requestId, ...DEV, body: 'Вопрос' });

        expect(view.authorRole).toBe('developer');
        expect((s.events.published.at(-1) as RequestCommentPostedEvent).commenterId).toBe('dev');
    });

    it('excerpt обрезается до 200 символов с «…»', async () => {
        const s = setup();
        const requestId = await newRequest(s);

        await s.post.execute({ requestId, ...AUTHOR, body: 'a'.repeat(500) });

        const excerpt = (s.events.published.at(-1) as RequestCommentPostedEvent).excerpt;
        expect(excerpt).toHaveLength(200);
        expect(excerpt.endsWith('…')).toBe(true);
    });

    it('чужая и несуществующая заявка дают RequestNotFoundError без записи', async () => {
        const s = setup();
        const requestId = await newRequest(s);

        await expect(s.post.execute({ requestId, ...STRANGER, body: 'x' })).rejects.toBeInstanceOf(
            RequestNotFoundError,
        );
        await expect(
            s.post.execute({ requestId: 'nope', ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);
        expect(s.comments.byId.size).toBe(0);
        expect(s.events.published.filter((e) => e instanceof RequestCommentPostedEvent)).toEqual(
            [],
        );
    });

    it.each([['   '], ['a'.repeat(4001)]])(
        'невалидный текст -> ArgumentInvalidError',
        async (body) => {
            const s = setup();
            const requestId = await newRequest(s);

            await expect(s.post.execute({ requestId, ...AUTHOR, body })).rejects.toBeInstanceOf(
                ArgumentInvalidError,
            );
            expect(s.comments.byId.size).toBe(0);
        },
    );

    it('комментарий создаётся в любом статусе, статус не меняется', async () => {
        const s = setup();
        const a = await newRequest(s);
        await s.post.execute({ requestId: a, ...AUTHOR, body: 'new' });
        expect((await s.requestQuery.findView(a))?.status.code).toBe('new');

        await s.take.execute({ requestId: a, reviewerId: 'dev' });
        await s.post.execute({ requestId: a, ...DEV, body: 'under_review' });
        expect((await s.requestQuery.findView(a))?.status.code).toBe('under_review');

        await s.reject.execute({ requestId: a, decidedBy: 'dev', reason: 'Причина' });
        await s.post.execute({ requestId: a, ...AUTHOR, body: 'rejected' });
        expect((await s.requestQuery.findView(a))?.status.code).toBe('rejected');

        const b = await newRequest(s);
        await s.take.execute({ requestId: b, reviewerId: 'dev' });
        s.catalog.addProduct('control-center', 'Control Center');
        const agent = s.catalog.addAgent('control-center', 'tasks', 'Задачи');
        await s.accept.execute({
            requestId: b,
            decidedBy: 'dev',
            effortHours: 2,
            target: {
                kind: 'new_skill',
                agentId: agent.id,
                name: 'Навык',
                description: 'Описание',
            },
        });
        await s.post.execute({ requestId: b, ...AUTHOR, body: 'accepted' });
        expect((await s.requestQuery.findView(b))?.status.code).toBe('planned');
        expect(s.comments.byId.size).toBe(4);
    });

    it('ошибка публикации откатывает комментарий', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        s.events.publish = (): Promise<void> => Promise.reject(new Error('outbox down'));

        await expect(s.post.execute({ requestId, ...AUTHOR, body: 'x' })).rejects.toThrow(
            'outbox down',
        );

        expect(s.comments.byId.size).toBe(0);
    });
});

describe('ListCommentsUseCase', () => {
    it('лента по порядку, canEdit по окну и автору', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        const t0 = new Date('2026-02-01T10:00:00Z');
        s.clock.set(t0);
        await s.post.execute({ requestId, ...AUTHOR, body: 'старый' });
        s.clock.set(new Date(t0.getTime() + minutes(16)));
        await s.post.execute({ requestId, ...DEV, body: 'чужой' });
        s.clock.set(new Date(t0.getTime() + minutes(17)));
        await s.post.execute({ requestId, ...AUTHOR, body: 'свежий' });

        s.clock.set(new Date(t0.getTime() + minutes(20)));
        let items = await s.list.execute({ requestId, ...AUTHOR });
        expect(items.map((i) => [i.body, i.canEdit])).toEqual([
            ['старый', false],
            ['чужой', false],
            ['свежий', true],
        ]);

        s.clock.set(new Date(t0.getTime() + minutes(5)));
        items = await s.list.execute({ requestId, ...AUTHOR });
        expect(items[0]?.canEdit).toBe(true);
    });

    it('нет заявки или нет доступа -> RequestNotFoundError', async () => {
        const s = setup();
        const requestId = await newRequest(s);

        await expect(s.list.execute({ requestId, ...STRANGER })).rejects.toBeInstanceOf(
            RequestNotFoundError,
        );
        await expect(s.list.execute({ requestId: 'nope', ...AUTHOR })).rejects.toBeInstanceOf(
            RequestNotFoundError,
        );
        await expect(s.list.execute({ requestId, ...DEV })).resolves.toEqual([]);
    });
});

describe('EditCommentUseCase', () => {
    it('автор правит в окне: тело и editedAt, без событий', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        const created = await s.post.execute({ requestId, ...AUTHOR, body: 'до' });
        const eventsBefore = s.events.published.length;
        s.clock.set(new Date(s.clock.now().getTime() + minutes(5)));

        const view = await s.edit.execute({
            requestId,
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
        const requestId = await newRequest(s);
        const created = await s.post.execute({ requestId, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ requestId, commentId: created.id, ...DEV, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotOwnedError);
    });

    it('окно истекло -> CommentEditWindowExpiredError', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        const created = await s.post.execute({ requestId, ...AUTHOR, body: 'до' });
        s.clock.set(new Date(s.clock.now().getTime() + minutes(16)));

        await expect(
            s.edit.execute({ requestId, commentId: created.id, ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentEditWindowExpiredError);
    });

    it('нет комментария или другая заявка -> CommentNotFoundError; нет доступа -> RequestNotFoundError', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        const other = await newRequest(s);
        const created = await s.post.execute({ requestId, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ requestId, commentId: 'nope', ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotFoundError);
        await expect(
            s.edit.execute({ requestId: other, commentId: created.id, ...AUTHOR, body: 'x' }),
        ).rejects.toBeInstanceOf(CommentNotFoundError);
        await expect(
            s.edit.execute({ requestId, commentId: created.id, ...STRANGER, body: 'x' }),
        ).rejects.toBeInstanceOf(RequestNotFoundError);
    });

    it('невалидный текст -> ArgumentInvalidError, комментарий не меняется', async () => {
        const s = setup();
        const requestId = await newRequest(s);
        const created = await s.post.execute({ requestId, ...AUTHOR, body: 'до' });

        await expect(
            s.edit.execute({ requestId, commentId: created.id, ...AUTHOR, body: ' ' }),
        ).rejects.toBeInstanceOf(ArgumentInvalidError);
        expect(s.comments.byId.get(created.id)?.body.value).toBe('до');
    });
});
