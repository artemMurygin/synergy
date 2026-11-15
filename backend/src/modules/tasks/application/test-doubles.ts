import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import type { CommonQueryMethods } from 'slonik';
import { vi } from 'vitest';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../shared/ddd';
import type { Actor } from '../domain/actor';
import type { DirectoryUser } from '../domain/ports/user-directory.port';
import type { Task } from '../domain/task';
import type { TaskFilter } from '../domain/task-filter';
import type { TaskSort } from '../domain/task-sort';
import type { TaskAccessPolicy } from '../domain/ports/task-access-policy.port';
import type {
    TaskRepository,
    TaskPage,
    TaskPageRequest,
} from '../domain/ports/task-repository.port';
import type { UserDirectory } from '../domain/ports/user-directory.port';
import { MeetingRecordingsPort } from '../domain/ports/meeting-recordings.port';
import { AttachmentTooLargeError } from '../domain/errors';
import type { FileStorage } from '../domain/ports/file-storage.port';
import type { TaskAttachmentRepository } from '../domain/ports/task-attachment-repository.port';
import type { TasksSettings } from '../domain/ports/tasks-settings.port';
import type { TaskAttachment } from '../domain/task-attachment';
import type { TaskBatchDraftRepositoryPort } from '../domain/ports/task-batch-draft-repository.port';
import { TaskBatchDraft } from '../domain/task-batch-draft';
import type { TaskBatchResult } from '../domain/task-batch-result';

export const NOW = new Date('2026-01-10T12:00:00Z');
export const fakeClock = { now: (): Date => NOW };

export interface TransactionParticipant {
    snapshot(): () => void;
}

export class SnapshotTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<(() => void)[]>();

    commits = 0;

    rollbacks = 0;

    constructor(private readonly participants: readonly TransactionParticipant[]) {
        super();
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const restores = this.participants.map((participant) => participant.snapshot());
        const callbacks: (() => void)[] = [];
        try {
            const result = await this.storage.run(callbacks, work);
            this.commits += 1;
            for (const callback of callbacks) callback();
            return result;
        } catch (error: unknown) {
            this.rollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    async savepoint<T>(work: () => Promise<T>): Promise<T> {
        const parentCallbacks = this.storage.getStore();
        if (parentCallbacks === undefined) return this.run(work);
        const restores = this.participants.map((participant) => participant.snapshot());
        const callbacks: (() => void)[] = [];
        try {
            const result = await this.storage.run(callbacks, work);
            parentCallbacks.push(...callbacks);
            return result;
        } catch (error: unknown) {
            for (const restore of restores) restore();
            throw error;
        }
    }

    executor(): CommonQueryMethods {
        throw new Error('SnapshotTransactionRunner has no database connection');
    }

    afterCommit(callback: () => void): void {
        const callbacks = this.storage.getStore();
        if (callbacks === undefined) {
            throw new Error('afterCommit was called outside a transaction');
        }
        callbacks.push(callback);
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }
}

export class RecordingEventPublisher extends DomainEventPublisherPort {
    readonly published: DomainEvent[] = [];

    readonly publishedInTransaction: boolean[] = [];

    failure: Error | null = null;

    onPublish: (() => void) | null = null;

    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    publish(events: readonly DomainEvent[]): Promise<void> {
        this.publishedInTransaction.push(this.transactions.isInTransaction());
        this.onPublish?.();
        if (this.failure !== null) return Promise.reject(this.failure);
        this.published.push(...events);
        return Promise.resolve();
    }
}

export class InMemoryTaskRepository implements TaskRepository, TransactionParticipant {
    readonly byId = new Map<string, Task>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, task] of saved) this.byId.set(id, task);
        };
    }

    constructor(private readonly clock: { now(): Date } = fakeClock) {}

    findById = vi.fn((id: string) => {
        const task = this.byId.get(id);
        return Promise.resolve(task === undefined || task.isDeleted() ? null : task);
    });

    save = vi.fn((task: Task) => {
        this.byId.set(task.id, task);
        return Promise.resolve();
    });

    list = vi.fn((filter: TaskFilter, sort: TaskSort, page: TaskPageRequest): Promise<TaskPage> => {
        const now = this.clock.now().getTime();
        const matching = [...this.byId.values()]
            .filter((task) => !task.isDeleted())
            .filter((task) => matches(task, filter, now))
            .sort((a, b) => compare(a, b, sort));
        const start = page.page * page.limit;
        return Promise.resolve({
            items: matching.slice(start, start + page.limit),
            total: matching.length,
        });
    });
}

function matches(task: Task, filter: TaskFilter, now: number): boolean {
    if (filter.status !== undefined && task.status !== filter.status) return false;
    if (filter.creatorId !== undefined && task.creatorId !== filter.creatorId) return false;
    if (filter.assigneeId !== undefined && task.assigneeId !== filter.assigneeId) return false;
    if (filter.watcherId !== undefined && !task.watcherIds.includes(filter.watcherId)) {
        return false;
    }
    if (filter.overdue !== undefined) {
        const overdue =
            task.deadline !== null && task.deadline.getTime() < now && task.status !== 'done';
        if (overdue !== filter.overdue) return false;
    }
    if (filter.titleContains !== undefined) {
        const needle = filter.titleContains.toLowerCase();
        if (!task.title.value.toLowerCase().includes(needle)) return false;
    }
    return true;
}

function compare(a: Task, b: Task, sort: TaskSort): number {
    const left = sortValue(a, sort);
    const right = sortValue(b, sort);
    // NULL deadlines always go last, like in the SQL implementation.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return sort.direction === 'asc' ? left - right : right - left;
}

function sortValue(task: Task, sort: TaskSort): number | null {
    switch (sort.field) {
        case 'deadline':
            return task.deadline?.getTime() ?? null;
        case 'createdAt':
            return task.createdAt.getTime();
        case 'updatedAt':
            return task.updatedAt.getTime();
    }
}

export class FakeUserDirectory implements UserDirectory {
    readonly users = new Map<string, DirectoryUser>();
    private readonly inactiveIds = new Set<string>();

    constructor(users: readonly DirectoryUser[] = []) {
        for (const user of users) this.users.set(user.id, user);
    }

    deactivate(id: string): void {
        this.inactiveIds.add(id);
    }

    findByIds = vi.fn((ids: readonly string[]) =>
        Promise.resolve(
            [...new Set(ids)].flatMap((id) => {
                const user = this.users.get(id);
                return user === undefined ? [] : [user];
            }),
        ),
    );

    findActiveByIds = vi.fn((ids: readonly string[]) =>
        Promise.resolve(
            [...new Set(ids)].flatMap((id) => {
                const user = this.users.get(id);
                return user === undefined || this.inactiveIds.has(id) ? [] : [user];
            }),
        ),
    );

    searchActive = vi.fn((query: string, limit: number) => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return Promise.resolve([]);
        return Promise.resolve(
            [...this.users.values()]
                .filter((user) => !this.inactiveIds.has(user.id))
                .filter((user) => user.login.toLowerCase().includes(needle))
                .slice(0, limit),
        );
    });
}

export interface FakeRecording {
    ownerId: string;
    fileId: string;
    name: string;
}

export class FakeMeetingRecordings extends MeetingRecordingsPort {
    constructor(private readonly recordings: readonly FakeRecording[] = []) {
        super();
    }

    findOwnedRecordingName(ownerId: string, fileId: string): Promise<string | null> {
        const found = this.recordings.find(
            (recording) => recording.ownerId === ownerId && recording.fileId === fileId,
        );
        return Promise.resolve(found?.name ?? null);
    }
}

export class FakeAccessPolicy implements TaskAccessPolicy {
    allowed = true;
    canRead = vi.fn((_actor: Actor, _task: Task) => this.allowed);
    canUpdate = vi.fn((_actor: Actor, _task: Task) => this.allowed);
    canDelete = vi.fn((_actor: Actor, _task: Task) => this.allowed);
}

export class FakeTasksSettings implements TasksSettings {
    maxFileSizeBytes = 1024;
    maxFilesPerTask = 2;
}

export class InMemoryFileStorage implements FileStorage {
    readonly files = new Map<string, Buffer>();
    private counter = 0;

    save = vi.fn(async (stream: Readable, options: { maxBytes: number }) => {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream) {
            const buffer = Buffer.from(chunk as Uint8Array);
            size += buffer.length;
            if (size > options.maxBytes) throw new AttachmentTooLargeError(options.maxBytes);
            chunks.push(buffer);
        }
        this.counter += 1;
        const storageKey = `key-${String(this.counter)}`;
        this.files.set(storageKey, Buffer.concat(chunks));
        return { storageKey, sizeBytes: size };
    });

    open = vi.fn((storageKey: string) => {
        const content = this.files.get(storageKey);
        return Promise.resolve(content === undefined ? null : Readable.from([content]));
    });

    delete = vi.fn((storageKey: string) => {
        this.files.delete(storageKey);
        return Promise.resolve();
    });
}

export class InMemoryAttachmentRepository implements TaskAttachmentRepository {
    readonly byId = new Map<string, TaskAttachment>();
    /** Optional liveness check of the owning task, set by tests that need it. */
    taskExists: ((taskId: string) => Promise<boolean>) | null = null;

    insert = vi.fn((attachment: TaskAttachment) => {
        this.byId.set(attachment.id, attachment);
        return Promise.resolve();
    });

    findByTask = vi.fn((taskId: string, attachmentId: string) => {
        const attachment = this.byId.get(attachmentId);
        return Promise.resolve(attachment?.taskId === taskId ? attachment : null);
    });

    countByTask = vi.fn((taskId: string) =>
        Promise.resolve([...this.byId.values()].filter((a) => a.taskId === taskId).length),
    );

    countByTasks = vi.fn((taskIds: readonly string[]) => {
        const counts = new Map<string, number>();
        for (const attachment of this.byId.values()) {
            if (taskIds.includes(attachment.taskId)) {
                counts.set(attachment.taskId, (counts.get(attachment.taskId) ?? 0) + 1);
            }
        }
        return Promise.resolve(counts);
    });

    /** Mirrors the SQL implementation: the task must be live and under the limit. */
    insertWithinLimit = vi.fn(async (attachment: TaskAttachment, limit: number) => {
        if (this.taskExists !== null && !(await this.taskExists(attachment.taskId))) {
            return 'task-missing' as const;
        }
        if ((await this.countByTask(attachment.taskId)) >= limit) return 'limit-reached' as const;
        await this.insert(attachment);
        return 'inserted' as const;
    });

    listByTask = vi.fn((taskId: string) =>
        Promise.resolve(
            [...this.byId.values()]
                .filter((a) => a.taskId === taskId)
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        ),
    );

    delete = vi.fn((attachmentId: string) => Promise.resolve(this.byId.delete(attachmentId)));
}

/**
 * Mirrors the SQL repository: `consume` flips only a `draft` row, so of two concurrent calls
 * exactly one wins. Stores snapshots of the props, not the live aggregates.
 */
export class InMemoryTaskBatchDraftRepository
    implements TaskBatchDraftRepositoryPort, TransactionParticipant
{
    readonly byId = new Map<string, ReturnType<TaskBatchDraft['getProps']>>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, props] of saved) this.byId.set(id, props);
        };
    }

    save = vi.fn((draft: TaskBatchDraft) => {
        const active = [...this.byId.values()].find(
            (props) =>
                props.threadId === draft.threadId &&
                props.status === 'draft' &&
                props.id !== draft.id,
        );
        if (draft.status === 'draft' && active !== undefined) {
            return Promise.reject(new Error('An active draft of the thread already exists'));
        }
        this.byId.set(draft.id, draft.getProps());
        return Promise.resolve();
    });

    findById = vi.fn((id: string, ownerId: string) => {
        const props = this.byId.get(id);
        if (props?.ownerId !== ownerId) return Promise.resolve(null);
        return Promise.resolve(TaskBatchDraft.restore({ ...props }));
    });

    supersedeActive = vi.fn((threadId: string, ownerId: string) => {
        for (const [id, props] of this.byId) {
            if (
                props.threadId === threadId &&
                props.ownerId === ownerId &&
                props.status === 'draft'
            ) {
                this.byId.set(id, { ...props, status: 'superseded' });
            }
        }
        return Promise.resolve();
    });

    consume = vi.fn((id: string, ownerId: string) => {
        const props = this.byId.get(id);
        if (props?.ownerId !== ownerId || props.status !== 'draft') return Promise.resolve(false);
        this.byId.set(id, { ...props, status: 'consumed' });
        return Promise.resolve(true);
    });

    saveResult = vi.fn((id: string, result: TaskBatchResult) => {
        const props = this.byId.get(id);
        if (props !== undefined) this.byId.set(id, { ...props, result });
        return Promise.resolve();
    });
}
