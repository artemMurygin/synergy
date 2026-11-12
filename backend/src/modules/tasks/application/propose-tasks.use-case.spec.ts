import { beforeEach, describe, expect, it } from 'vitest';
import { Actor } from '../domain/actor';
import { DraftOrigin } from '../domain/draft-origin';
import {
    InvalidDraftItemError,
    TooManyDraftTasksError,
    UnknownDraftUserError,
} from '../domain/task-batch-errors';
import { ProposeTasksUseCase, type ProposedItemInput } from './propose-tasks.use-case';
import {
    FakeUserDirectory,
    InMemoryTaskBatchDraftRepository,
    SnapshotTransactionRunner,
    fakeClock,
} from './test-doubles';

const me = Actor.of('me');
const THREAD = 'thread-1';

let drafts: InMemoryTaskBatchDraftRepository;
let directory: FakeUserDirectory;
let transactions: SnapshotTransactionRunner;
let useCase: ProposeTasksUseCase;

beforeEach(() => {
    drafts = new InMemoryTaskBatchDraftRepository();
    directory = new FakeUserDirectory([
        { id: 'me', login: 'me' },
        { id: 'anna', login: 'anna' },
        { id: 'boris', login: 'boris' },
    ]);
    transactions = new SnapshotTransactionRunner([drafts]);
    useCase = new ProposeTasksUseCase(drafts, directory, fakeClock, transactions);
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    throw new Error('Expected the promise to reject');
}

describe('ProposeTasksUseCase', () => {
    it('saves a draft and returns numbered cards with resolved users', async () => {
        const deadline = new Date('2026-03-05T15:00:00Z');
        const { draftId, cards } = await useCase.execute(me, {
            threadId: THREAD,
            items: [
                { title: 'Подготовить КП', assigneeId: 'anna', deadline, sourceNote: '[00:01:02]' },
                { title: 'Созвон', creatorId: 'boris', watcherIds: ['anna'] },
            ],
        });

        expect(cards).toEqual([
            {
                number: 1,
                title: 'Подготовить КП',
                description: '',
                deadline,
                assignee: { id: 'anna', login: 'anna' },
                creator: { id: 'me', login: 'me' },
                onBehalf: false,
                watchers: [],
                sourceNote: '[00:01:02]',
            },
            {
                number: 2,
                title: 'Созвон',
                description: '',
                deadline: null,
                assignee: null,
                creator: { id: 'boris', login: 'boris' },
                onBehalf: true,
                watchers: [{ id: 'anna', login: 'anna' }],
                sourceNote: null,
            },
        ]);
        const stored = drafts.byId.get(draftId);
        expect(stored?.status).toBe('draft');
        expect(stored?.ownerId).toBe('me');
        expect(stored?.threadId).toBe(THREAD);
        expect(stored?.items.map((i) => i.creatorId)).toEqual(['me', 'boris']);
        expect(stored?.origin).toBeNull();
    });

    it('keeps the meeting origin of the list', async () => {
        const origin = DraftOrigin.meeting({ fileId: 'f1', recordingName: 'Планёрка.m4a' });
        const { draftId } = await useCase.execute(me, {
            threadId: THREAD,
            items: [{ title: 'Задача' }],
            origin,
        });

        expect(drafts.byId.get(draftId)?.origin).toEqual(origin);
    });

    it('marks the previous draft of the thread superseded', async () => {
        const first = await useCase.execute(me, { threadId: THREAD, items: [{ title: 'A' }] });
        const second = await useCase.execute(me, { threadId: THREAD, items: [{ title: 'B' }] });
        const other = await useCase.execute(me, { threadId: 'thread-2', items: [{ title: 'C' }] });

        expect(drafts.byId.get(first.draftId)?.status).toBe('superseded');
        expect(drafts.byId.get(second.draftId)?.status).toBe('draft');
        expect(drafts.byId.get(other.draftId)?.status).toBe('draft');
    });

    it.each([
        ['assignee', { title: 'B', assigneeId: 'ghost' }],
        ['creator', { title: 'B', creatorId: 'ghost' }],
        ['watcher', { title: 'B', watcherIds: ['anna', 'ghost'] }],
    ] as const)(
        'rejects an unknown %s with the number of the task',
        async (field, bad: ProposedItemInput) => {
            const error = await caught(
                useCase.execute(me, { threadId: THREAD, items: [{ title: 'A' }, bad] }),
            );

            expect(error).toBeInstanceOf(UnknownDraftUserError);
            expect(error).toMatchObject({ index: 2, field, userId: 'ghost' });
            expect([...drafts.byId.values()].filter((d) => d.status === 'draft')).toHaveLength(0);
        },
    );

    it('supersedes the previous draft even when the new list is rejected', async () => {
        const first = await useCase.execute(me, { threadId: THREAD, items: [{ title: 'A' }] });

        await caught(
            useCase.execute(me, {
                threadId: THREAD,
                items: [{ title: 'B', assigneeId: 'ghost' }],
            }),
        );

        expect(drafts.byId.get(first.draftId)?.status).toBe('superseded');
        expect(drafts.byId.size).toBe(1);
    });

    it('rejects an invalid item with its number', async () => {
        const error = await caught(
            useCase.execute(me, { threadId: THREAD, items: [{ title: 'A' }, { title: '  ' }] }),
        );

        expect(error).toBeInstanceOf(InvalidDraftItemError);
        expect(error).toMatchObject({ index: 2 });
    });

    it('rejects more than 30 tasks before looking up users', async () => {
        const items = Array.from({ length: 31 }, (_, i) => ({ title: `T${String(i)}` }));

        await expect(useCase.execute(me, { threadId: THREAD, items })).rejects.toBeInstanceOf(
            TooManyDraftTasksError,
        );
        expect(directory.findActiveByIds).not.toHaveBeenCalled();
        expect(drafts.save).not.toHaveBeenCalled();
    });
});
