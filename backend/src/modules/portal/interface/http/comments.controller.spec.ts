import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArgumentInvalidError } from '../../../../shared/errors';
import type { CommentView } from '../../application/comment-view';
import { EditCommentUseCase } from '../../application/edit-comment.use-case';
import { ListCommentsUseCase } from '../../application/list-comments.use-case';
import { PostCommentUseCase } from '../../application/post-comment.use-case';
import {
    CommentEditWindowExpiredError,
    CommentNotFoundError,
    CommentNotOwnedError,
    RequestNotFoundError,
} from '../../domain/errors';
import { CommentsController } from './comments.controller';
import { type HttpFixture, startHttpFixture, USER_ID } from './testing/http-fixture';

const REQUEST_ID = '5f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const COMMENT_ID = '6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

const list = { execute: vi.fn() };
const post = { execute: vi.fn() };
const edit = { execute: vi.fn() };

const view: CommentView = {
    id: COMMENT_ID,
    authorId: USER_ID,
    body: 'Нужны выгрузки',
    author: { id: USER_ID, login: 'anna', fullName: 'Иванова Анна' },
    authorRole: 'request_author',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    editedAt: null,
    canEdit: true,
};

const response = {
    id: COMMENT_ID,
    body: 'Нужны выгрузки',
    author: { id: USER_ID, login: 'anna', fullName: 'Иванова Анна' },
    authorRole: 'request_author',
    createdAt: '2026-11-06T10:00:00.000Z',
    editedAt: null,
    canEdit: true,
};

describe('CommentsController', () => {
    let fixture: HttpFixture;

    beforeAll(async () => {
        fixture = await startHttpFixture({
            controllers: [CommentsController],
            providers: [
                { provide: ListCommentsUseCase, useValue: list },
                { provide: PostCommentUseCase, useValue: post },
                { provide: EditCommentUseCase, useValue: edit },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        list.execute.mockResolvedValue([view]);
        post.execute.mockResolvedValue(view);
        edit.execute.mockResolvedValue({ ...view, editedAt: new Date('2026-11-06T10:05:00.000Z') });
    });

    function call(
        method: string,
        path: string,
        body?: unknown,
        headers: Record<string, string> = fixture.bearer(),
    ): Promise<Response> {
        return fetch(`${fixture.base}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    }

    const feed = `/portal/requests/${REQUEST_ID}/comments`;
    const one = `${feed}/${COMMENT_ID}`;

    describe('GET /portal/requests/:id/comments', () => {
        it('answers 200 with items and passes the token user and roles', async () => {
            const res = await call('GET', feed, undefined, fixture.bearer(['developer']));

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ items: [response] });
            expect(list.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                actorId: USER_ID,
                roles: ['developer'],
            });
        });

        it('answers an empty feed as { items: [] }', async () => {
            list.execute.mockResolvedValue([]);
            const res = await call('GET', feed);
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ items: [] });
        });

        it('answers 404 for an invalid uuid (the use case treats it as not found)', async () => {
            list.execute.mockRejectedValue(new RequestNotFoundError('nope'));
            const res = await call('GET', '/portal/requests/nope/comments');
            expect(res.status).toBe(404);
            expect(list.execute).toHaveBeenCalledWith(
                expect.objectContaining({ requestId: 'nope' }),
            );
        });

        it('answers 404 PORTAL_REQUEST_NOT_FOUND when there is no access', async () => {
            list.execute.mockRejectedValue(new RequestNotFoundError(REQUEST_ID));
            const res = await call('GET', feed);
            expect(res.status).toBe(404);
            expect(((await res.json()) as { code: string }).code).toBe('PORTAL_REQUEST_NOT_FOUND');
        });

        it('answers 401 without a token', async () => {
            const res = await fetch(`${fixture.base}${feed}`);
            expect(res.status).toBe(401);
            expect(list.execute).not.toHaveBeenCalled();
        });
    });

    describe('POST /portal/requests/:id/comments', () => {
        it('answers 201 with the comment and passes the token user', async () => {
            const res = await call('POST', feed, { body: 'Нужны выгрузки', authorId: 'x' });

            expect(res.status).toBe(201);
            expect(await res.json()).toEqual(response);
            expect(post.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                actorId: USER_ID,
                roles: [],
                body: 'Нужны выгрузки',
            });
        });

        it.each([
            ['missing body', {}],
            ['non-string body', { body: 5 }],
            ['body over 20000', { body: 'я'.repeat(20001) }],
        ])('answers 400 for %s', async (_name, body) => {
            const res = await call('POST', feed, body);
            expect(res.status).toBe(400);
            expect(post.execute).not.toHaveBeenCalled();
        });

        it('answers 400 when the domain rejects an empty or too long text', async () => {
            post.execute.mockRejectedValue(new ArgumentInvalidError('body is empty'));
            const res = await call('POST', feed, { body: '   ' });
            expect(res.status).toBe(400);
        });

        it('answers 404 for an unknown request or no access', async () => {
            post.execute.mockRejectedValue(new RequestNotFoundError(REQUEST_ID));
            const res = await call('POST', feed, { body: 'текст' });
            expect(res.status).toBe(404);
            expect(((await res.json()) as { code: string }).code).toBe('PORTAL_REQUEST_NOT_FOUND');
        });

        it('answers 401 without a token', async () => {
            const res = await fetch(`${fixture.base}${feed}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ body: 'текст' }),
            });
            expect(res.status).toBe(401);
        });
    });

    describe('PATCH /portal/requests/:id/comments/:commentId', () => {
        it('answers 200 with the edited comment', async () => {
            const res = await call('PATCH', one, { body: 'Новый текст' });

            expect(res.status).toBe(200);
            expect(((await res.json()) as { editedAt: string }).editedAt).toBe(
                '2026-11-06T10:05:00.000Z',
            );
            expect(edit.execute).toHaveBeenCalledWith({
                requestId: REQUEST_ID,
                commentId: COMMENT_ID,
                actorId: USER_ID,
                roles: [],
                body: 'Новый текст',
            });
        });

        it.each([
            ['missing body', {}],
            ['body over 20000', { body: 'я'.repeat(20001) }],
        ])('answers 400 for %s', async (_name, body) => {
            const res = await call('PATCH', one, body);
            expect(res.status).toBe(400);
            expect(edit.execute).not.toHaveBeenCalled();
        });

        it('answers 404 for an invalid comment uuid (the use case treats it as not found)', async () => {
            edit.execute.mockRejectedValue(new CommentNotFoundError('nope'));
            const res = await call('PATCH', `${feed}/nope`, { body: 'текст' });
            expect(res.status).toBe(404);
            expect(edit.execute).toHaveBeenCalledWith(
                expect.objectContaining({ commentId: 'nope' }),
            );
        });

        it.each([
            [new CommentNotOwnedError(COMMENT_ID), 403, 'PORTAL_COMMENT_NOT_OWNED'],
            [new CommentEditWindowExpiredError(COMMENT_ID), 409, 'PORTAL_COMMENT_EDIT_EXPIRED'],
            [new CommentNotFoundError(COMMENT_ID), 404, 'PORTAL_COMMENT_NOT_FOUND'],
            [new RequestNotFoundError(REQUEST_ID), 404, 'PORTAL_REQUEST_NOT_FOUND'],
        ])('maps %s to %i', async (error, status, code) => {
            edit.execute.mockRejectedValue(error);
            const res = await call('PATCH', one, { body: 'текст' });
            expect(res.status).toBe(status);
            expect(((await res.json()) as { code: string }).code).toBe(code);
        });

        it('answers 401 without a token', async () => {
            const res = await fetch(`${fixture.base}${one}`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ body: 'текст' }),
            });
            expect(res.status).toBe(401);
        });
    });
});
