import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CommentView } from '../../application/comment-view';
import type { RequestView } from '../../application/request-view';
import { CommentListResponse } from './comments.responses';
import { acceptRequestSchema } from './requests.schemas';
import { RequestResponse } from './requests.responses';

// Контракт фронт—бэк: общие фикстуры лежат в портале. Ответы фикстуры должны совпадать
// с реальным RequestResponse (UPDATE_CONTRACT=1 перезаписывает их), портал разбирает их своими Zod-схемами.
const CONTRACT_DIR = resolve(process.cwd(), '../portal/src/test/contract');
const RESPONSES_FILE = resolve(CONTRACT_DIR, 'request-responses.json');
const COMMENTS_FILE = resolve(CONTRACT_DIR, 'comment-responses.json');
const BODIES_FILE = resolve(CONTRACT_DIR, 'accept-bodies.json');

const AUTHOR = { id: 'a1', login: 'anna', fullName: 'Иванова Анна' };
const REVIEWER = { id: 'd1', login: 'petrov', fullName: 'Петров Пётр' };
const TAKEN_AT = new Date('2026-11-07T09:00:00.000Z');

function view(overrides: Partial<RequestView>): RequestView {
    return {
        id: 'r1',
        authorId: AUTHOR.id,
        authorLogin: AUTHOR.login,
        authorFullName: AUTHOR.fullName,
        title: 'Сверка актов',
        description: 'Описание',
        frequency: { count: 1, period: 'day' },
        minutesPerRun: 10,
        peopleCount: 1,
        status: { code: 'new', label: 'Новая' },
        reviewer: null,
        takenAt: null,
        effortHours: null,
        rejectReason: null,
        skill: null,
        createdAt: new Date('2026-11-06T10:00:00.000Z'),
        ...overrides,
    };
}

const skill = { id: 's1', name: 'Навык', description: '' };

const views: [string, RequestView][] = [
    ['new', view({})],
    [
        'under_review',
        view({
            status: { code: 'under_review', label: 'На рассмотрении' },
            reviewer: REVIEWER,
            takenAt: TAKEN_AT,
        }),
    ],
    [
        'rejected',
        view({
            status: { code: 'rejected', label: 'Отклонена' },
            reviewer: REVIEWER,
            takenAt: TAKEN_AT,
            rejectReason: 'Уже есть',
        }),
    ],
    ...(['planned', 'in_dev', 'testing', 'launched', 'rework'] as const).map(
        (code): [string, RequestView] => [
            code,
            view({
                status: { code, label: code },
                reviewer: REVIEWER,
                takenAt: TAKEN_AT,
                effortHours: 16,
                skill,
            }),
        ],
    ),
    [
        'accepted before estimates existed',
        view({
            status: { code: 'planned', label: 'Запланировано' },
            reviewer: REVIEWER,
            takenAt: TAKEN_AT,
            effortHours: null,
            skill,
        }),
    ],
];

describe('RequestResponse contract fixture', () => {
    const actual = views.map(([name, requestView]) => ({
        name,
        response: JSON.parse(JSON.stringify(new RequestResponse(requestView))) as unknown,
    }));

    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(RESPONSES_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }

    it('portal fixture equals the real backend response for every status', () => {
        expect(existsSync(RESPONSES_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(RESPONSES_FILE, 'utf8'))).toEqual(actual);
    });

    it('covers every request status code', () => {
        const codes = actual.map((item) => (item.response as RequestResponse).status.code);
        expect(new Set(codes)).toEqual(
            new Set([
                'new',
                'under_review',
                'rejected',
                'planned',
                'in_dev',
                'testing',
                'launched',
                'rework',
            ]),
        );
    });
});

describe('portal accept body passes acceptRequestSchema', () => {
    const bodies = (
        JSON.parse(readFileSync(BODIES_FILE, 'utf8')) as { name: string; body: unknown }[]
    ).map((item): [string, unknown] => [item.name, item.body]);
    const uuid = '7f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f';

    it('has all three variants', () => {
        expect(bodies).toHaveLength(4);
    });

    it.each(bodies)('%s', (_name, body) => {
        expect(acceptRequestSchema.safeParse(body).success).toBe(true);
    });

    it('rejects the old top-level shape', () => {
        expect(acceptRequestSchema.safeParse({ skillId: uuid }).success).toBe(false);
    });
});

describe('CommentListResponse contract fixture', () => {
    const base: CommentView = {
        id: 'c1',
        authorId: AUTHOR.id,
        body: 'Нужны выгрузки',
        author: AUTHOR,
        authorRole: 'request_author',
        createdAt: new Date('2026-11-06T10:00:00.000Z'),
        editedAt: null,
        canEdit: true,
    };
    const comments: CommentView[] = [
        base,
        {
            ...base,
            id: 'c2',
            authorId: REVIEWER.id,
            body: 'Уточню\nу коллег',
            author: REVIEWER,
            authorRole: 'developer',
            createdAt: new Date('2026-11-06T10:03:00.000Z'),
            editedAt: new Date('2026-11-06T10:05:00.000Z'),
            canEdit: false,
        },
    ];
    const actual = JSON.parse(JSON.stringify(new CommentListResponse(comments))) as unknown;

    if (process.env.UPDATE_CONTRACT === '1') {
        writeFileSync(COMMENTS_FILE, `${JSON.stringify(actual, null, 2)}\n`);
    }

    it('portal fixture equals the real backend response', () => {
        expect(existsSync(COMMENTS_FILE)).toBe(true);
        expect(JSON.parse(readFileSync(COMMENTS_FILE, 'utf8'))).toEqual(actual);
    });

    it('has the documented shape with ISO dates and both roles', () => {
        const { items } = actual as { items: Record<string, unknown>[] };
        expect(Object.keys(items[0] ?? {}).sort()).toEqual(
            ['author', 'authorRole', 'body', 'canEdit', 'createdAt', 'editedAt', 'id'].sort(),
        );
        expect(items.map((item) => item.authorRole)).toEqual(['request_author', 'developer']);
        expect(items.map((item) => item.editedAt)).toEqual([null, '2026-11-06T10:05:00.000Z']);
        expect(items[0]?.createdAt).toBe('2026-11-06T10:00:00.000Z');
    });
});
