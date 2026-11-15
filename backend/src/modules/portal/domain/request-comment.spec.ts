import { describe, expect, it } from 'vitest';
import { CommentBody } from './comment-body';
import { CommentEditWindowExpiredError, CommentNotOwnedError } from './errors';
import { COMMENT_EDIT_WINDOW_MS, RequestComment } from './request-comment';

const T0 = new Date('2026-01-01T10:00:00.000Z');
const at = (ms: number): Date => new Date(T0.getTime() + ms);
const MIN = 60_000;

function make(): RequestComment {
    return RequestComment.create({
        id: 'c1',
        requestId: 'r1',
        authorId: 'u1',
        body: CommentBody.of('hello'),
        now: T0,
    });
}

describe('RequestComment', () => {
    it('create sets createdAt and null editedAt', () => {
        const c = make();
        expect(c.createdAt).toEqual(T0);
        expect(c.editedAt).toBeNull();
        expect(c.requestId).toBe('r1');
        expect(c.authorId).toBe('u1');
        expect(c.body.value).toBe('hello');
    });

    it('restore keeps given state', () => {
        const c = RequestComment.restore({
            id: 'c1',
            requestId: 'r1',
            authorId: 'u1',
            body: CommentBody.of('x'),
            createdAt: T0,
            editedAt: at(MIN),
        });
        expect(c.editedAt).toEqual(at(MIN));
    });

    it('window is 15 minutes', () => {
        expect(COMMENT_EDIT_WINDOW_MS).toBe(15 * MIN);
    });

    it('canEdit: only author within the window (inclusive)', () => {
        const c = make();
        expect(c.canEdit('u1', at(15 * MIN))).toBe(true);
        expect(c.canEdit('u1', at(15 * MIN + 1))).toBe(false);
        expect(c.canEdit('u2', at(MIN))).toBe(false);
    });

    it('edit by author changes body and editedAt, keeps createdAt', () => {
        const c = make();
        c.edit('u1', CommentBody.of('new'), at(5 * MIN));
        expect(c.body.value).toBe('new');
        expect(c.editedAt).toEqual(at(5 * MIN));
        expect(c.createdAt).toEqual(T0);
    });

    it('edit by someone else throws CommentNotOwnedError', () => {
        expect(() => {
            make().edit('u2', CommentBody.of('x'), at(MIN));
        }).toThrow(CommentNotOwnedError);
    });

    it('edit after 15 minutes + 1 ms throws CommentEditWindowExpiredError', () => {
        const c = make();
        expect(() => {
            c.edit('u1', CommentBody.of('x'), at(15 * MIN + 1));
        }).toThrow(CommentEditWindowExpiredError);
        expect(c.body.value).toBe('hello');
        expect(c.editedAt).toBeNull();
    });

    it('edit at exactly 15 minutes is allowed', () => {
        const c = make();
        c.edit('u1', CommentBody.of('x'), at(15 * MIN));
        expect(c.body.value).toBe('x');
    });

    it('editing does not extend the window', () => {
        const c = make();
        c.edit('u1', CommentBody.of('x'), at(10 * MIN));
        expect(() => {
            c.edit('u1', CommentBody.of('y'), at(16 * MIN));
        }).toThrow(CommentEditWindowExpiredError);
    });
});
