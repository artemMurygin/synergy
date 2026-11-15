import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BugCommentView } from '../../application/bug-comment-view';
import { BugStatusPolicy, BUG_STATUSES, type BugStatus } from '../../domain/bug-status';
import type { BugView } from '../../application/bug-view';
import { BugCommentListResponse } from './bug-comments.responses';
import { BugListResponse, BugResponse } from './bugs.responses';

// Контракт фронт—бэк для багов: фикстуры лежат в портале (UPDATE_CONTRACT=1 перезаписывает),
// портал разбирает их своими Zod-схемами (portal/src/test/bug-contract.test.ts).
const CONTRACT_DIR = resolve(process.cwd(), '../portal/src/test/contract');
const BUGS_FILE = resolve(CONTRACT_DIR, 'bug-responses.json');
const BUG_LIST_FILE = resolve(CONTRACT_DIR, 'bug-list-response.json');
const BUG_COMMENTS_FILE = resolve(CONTRACT_DIR, 'bug-comment-responses.json');

const AUTHOR = { id: 'a1', login: 'anna', fullName: 'Иванова Анна' };
const DEV = { id: 'd1', login: 'petrov', fullName: 'Петров Пётр' };
const CREATED = new Date('2026-11-06T10:00:00.000Z');
const CHANGED = new Date('2026-11-07T09:00:00.000Z');

function view(status: BugStatus, overrides: Partial<BugView> = {}): BugView {
    return {
        id: 'b1',
        title: 'Не отвечает',
        description: 'Нажал «Отправить», ответа нет',
        product: { id: 'p1', name: 'Manager Helper' },
        agent: { id: 'g1', name: 'Ассистент' },
        author: AUTHOR,
        status,
        createdAt: CREATED,
        statusChangedAt: status === 'open' ? CREATED : CHANGED,
        statusChangedBy: status === 'open' ? null : DEV,
        wontFixReason: status === 'wont_fix' ? 'Дубль\nпервого бага' : null,
        nextStatuses: BugStatusPolicy.nextStatuses(status),
        ...overrides,
    };
}

const views: [string, BugView][] = [
    ...BUG_STATUSES.map((status): [string, BugView] => [status, view(status)]),
    ['open for a non-developer', view('open', { nextStatuses: [] })],
];

describe('BugResponse contract fixture', () => {
    const actual = views.map(([name, bugView]) => ({
        name,
        response: JSON.parse(JSON.stringify(new BugResponse(bugView))) as unknown,
    }));
    const list = JSON.parse(
        JSON.stringify(
            new BugListResponse(
                { items: [view('open'), view('wont_fix')], total: 2 },
                { limit: 20, page: 0 },
            ),
        ),
    ) as unknown;

    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(BUGS_FILE, `${JSON.stringify(actual, null, 2)}\n`);
        writeFileSync(BUG_LIST_FILE, `${JSON.stringify(list, null, 2)}\n`);
    }

    it('portal fixture equals the real backend response for every status', () => {
        expect(existsSync(BUGS_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(BUGS_FILE, 'utf8'))).toEqual(actual);
    });

    it('portal list fixture equals the real backend list response', () => {
        expect(existsSync(BUG_LIST_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(BUG_LIST_FILE, 'utf8'))).toEqual(list);
    });

    it('covers every status', () => {
        const statuses = actual.map((item) => (item.response as BugResponse).status);
        expect(new Set(statuses)).toEqual(new Set(BUG_STATUSES));
    });
});

describe('BugCommentListResponse contract fixture', () => {
    const base: BugCommentView = {
        id: 'c1',
        authorId: AUTHOR.id,
        body: 'Воспроизводится каждый раз',
        author: AUTHOR,
        authorRole: 'bug_author',
        createdAt: new Date('2026-11-06T10:00:00.000Z'),
        editedAt: null,
        canEdit: true,
    };
    const comments: BugCommentView[] = [
        base,
        {
            ...base,
            id: 'c2',
            authorId: DEV.id,
            body: 'Смотрю\nлоги',
            author: DEV,
            authorRole: 'developer',
            createdAt: new Date('2026-11-06T10:03:00.000Z'),
            editedAt: new Date('2026-11-06T10:05:00.000Z'),
            canEdit: false,
        },
    ];
    const actual = JSON.parse(JSON.stringify(new BugCommentListResponse(comments))) as unknown;

    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(BUG_COMMENTS_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }

    it('portal fixture equals the real backend response', () => {
        expect(existsSync(BUG_COMMENTS_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(BUG_COMMENTS_FILE, 'utf8'))).toEqual(actual);
    });

    it('has both bug roles', () => {
        const { items } = actual as { items: Record<string, unknown>[] };
        expect(items.map((item) => item.authorRole)).toEqual(['bug_author', 'developer']);
    });
});
