import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFileView } from '../../files/application/stored-file-view';
import { silentLogger } from '../../files/application/test-doubles';
import { Actor } from '../domain/actor';
import { DraftOrigin } from '../domain/draft-origin';
import { DraftAlreadyUsedError, DraftNotFoundError } from '../domain/task-batch-errors';
import { CreateTaskUseCase } from './create-task.use-case';
import { CreateTasksFromDraftUseCase } from './create-tasks-from-draft.use-case';
import { ProposeTasksUseCase, type ProposedItemInput } from './propose-tasks.use-case';
import type { TasksReportDocument } from './tasks-report-document';
import {
    FakeMeetingRecordings,
    FakeUserDirectory,
    InMemoryTaskBatchDraftRepository,
    InMemoryTaskRepository,
    RecordingEventPublisher,
    SnapshotTransactionRunner,
    fakeClock,
} from './test-doubles';

const me = Actor.of('me');
const THREAD = 'thread-1';
const ORIGIN = DraftOrigin.meeting({ fileId: 'f1', recordingName: 'Планёрка.m4a' });

const REPORT: StoredFileView = {
    id: 'report-1',
    name: 'Поставленные задачи — Планёрка.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
    sizeBytes: 1000,
    status: 'active',
    awaitingProcessing: false,
    uploadedAt: new Date('2026-01-10T12:00:00Z'),
    expiresAt: null,
    deletedAt: null,
};

let tasks: InMemoryTaskRepository;
let drafts: InMemoryTaskBatchDraftRepository;
let directory: FakeUserDirectory;
let transactions: SnapshotTransactionRunner;
let createTask: CreateTaskUseCase;
let issue: ReturnType<typeof vi.fn>;
let useCase: CreateTasksFromDraftUseCase;

beforeEach(() => {
    tasks = new InMemoryTaskRepository();
    drafts = new InMemoryTaskBatchDraftRepository();
    directory = new FakeUserDirectory([
        { id: 'me', login: 'me' },
        { id: 'anna', login: 'anna' },
        { id: 'boris', login: 'boris' },
    ]);
    transactions = new SnapshotTransactionRunner([tasks, drafts]);
    createTask = new CreateTaskUseCase(
        tasks,
        directory,
        fakeClock,
        transactions,
        new RecordingEventPublisher(transactions),
    );
    issue = vi.fn(() => Promise.resolve(REPORT));
    useCase = new CreateTasksFromDraftUseCase(
        drafts,
        createTask,
        directory,
        { issue } as unknown as TasksReportDocument,
        silentLogger(),
    );
});

async function propose(items: ProposedItemInput[], origin?: DraftOrigin): Promise<string> {
    const recordings = new FakeMeetingRecordings(
        origin === undefined
            ? []
            : [{ ownerId: 'me', fileId: origin.fileId, name: origin.recordingName }],
    );
    const propose = new ProposeTasksUseCase(drafts, directory, recordings, fakeClock, transactions);
    const { draftId } = await propose.execute(me, {
        threadId: THREAD,
        items,
        meetingFileId: origin?.fileId,
    });
    return draftId;
}

describe('CreateTasksFromDraftUseCase', () => {
    it('creates every task of the draft on behalf of the given creator', async () => {
        const draftId = await propose([
            { title: 'Подготовить КП', assigneeId: 'anna' },
            { title: 'Созвон', creatorId: 'boris' },
            { title: 'Отчёт', watcherIds: ['anna'] },
        ]);

        const { result, report } = await useCase.execute(me, { draftId });

        expect(result.createdCount).toBe(3);
        expect(result.items.map((i) => i.status)).toEqual(['created', 'created', 'created']);
        const created = [...tasks.byId.values()];
        expect(created.map((t) => t.title.value)).toEqual(['Подготовить КП', 'Созвон', 'Отчёт']);
        expect(created.map((t) => t.creatorId)).toEqual(['me', 'boris', 'me']);
        expect(created.every((t) => t.initiatorId === 'me')).toBe(true);
        expect(result.items.map((i) => (i.status === 'created' ? i.taskId : null))).toEqual(
            created.map((t) => t.id),
        );
        expect(report).toBeNull();
        expect(issue).not.toHaveBeenCalled();
        expect(drafts.byId.get(draftId)?.status).toBe('consumed');
        expect(drafts.byId.get(draftId)?.result).toEqual(result);
    });

    it('creates each task in its own transaction', async () => {
        const draftId = await propose([{ title: 'A' }, { title: 'B' }]);
        const before = transactions.commits;

        await useCase.execute(me, { draftId });

        expect(transactions.commits - before).toBeGreaterThanOrEqual(2);
    });

    it('keeps the other tasks when one of them fails and tells why', async () => {
        const draftId = await propose([
            { title: 'A', assigneeId: 'anna' },
            { title: 'B', assigneeId: 'boris' },
            { title: 'C' },
        ]);
        directory.users.delete('boris');

        const { result } = await useCase.execute(me, { draftId });

        expect(result.createdCount).toBe(2);
        expect(result.items[1]).toEqual({
            index: 2,
            status: 'failed',
            reason: expect.stringContaining('исполнитель') as unknown,
        });
        expect([...tasks.byId.values()].map((t) => t.title.value)).toEqual(['A', 'C']);
    });

    it('answers a repeated confirmation with DraftAlreadyUsedError and creates nothing', async () => {
        const draftId = await propose([{ title: 'A' }]);
        await useCase.execute(me, { draftId });

        const error = await useCase.execute(me, { draftId }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(DraftAlreadyUsedError);
        expect((error as DraftAlreadyUsedError).status).toBe('consumed');
        expect(tasks.byId.size).toBe(1);
    });

    it('lets only one of two parallel confirmations create the tasks', async () => {
        const draftId = await propose([{ title: 'A' }, { title: 'B' }]);

        const outcomes = await Promise.allSettled([
            useCase.execute(me, { draftId }),
            useCase.execute(me, { draftId }),
        ]);

        expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
        expect(tasks.byId.size).toBe(2);
    });

    it('does not create tasks of a superseded draft', async () => {
        const first = await propose([{ title: 'A' }]);
        await propose([{ title: 'A' }, { title: 'B' }]);

        await expect(useCase.execute(me, { draftId: first })).rejects.toMatchObject({
            status: 'superseded',
        });
        expect(tasks.byId.size).toBe(0);
    });

    it('does not reveal a draft of another user', async () => {
        const draftId = await propose([{ title: 'A' }]);

        await expect(useCase.execute(Actor.of('anna'), { draftId })).rejects.toBeInstanceOf(
            DraftNotFoundError,
        );
        expect(tasks.byId.size).toBe(0);
    });

    it('issues the «Поставленные задачи» document for a list from a meeting', async () => {
        const draftId = await propose([{ title: 'A', assigneeId: 'anna' }, { title: 'B' }], ORIGIN);

        const { result, report } = await useCase.execute(me, { draftId });

        expect(report).toBe(REPORT);
        expect(issue).toHaveBeenCalledTimes(1);
        const [input] = issue.mock.calls[0] as [
            {
                ownerId: string;
                origin: DraftOrigin;
                result: unknown;
                items: { title: { value: string } }[];
            },
        ];
        expect(input.ownerId).toBe('me');
        expect(input.origin).toEqual(ORIGIN);
        expect(input.result).toBe(result);
        expect(input.items.map((i) => i.title.value)).toEqual(['A', 'B']);
    });

    it('still issues the document when no task was created', async () => {
        const draftId = await propose([{ title: 'A', assigneeId: 'anna' }], ORIGIN);
        directory.users.delete('anna');

        const { result, report } = await useCase.execute(me, { draftId });

        expect(result.createdCount).toBe(0);
        expect(report).toBe(REPORT);
    });

    it('returns the result without a document when issuing it fails', async () => {
        const draftId = await propose([{ title: 'A' }], ORIGIN);
        issue.mockRejectedValueOnce(new Error('storage is down'));

        const { result, report } = await useCase.execute(me, { draftId });

        expect(result.createdCount).toBe(1);
        expect(report).toBeNull();
    });
});
