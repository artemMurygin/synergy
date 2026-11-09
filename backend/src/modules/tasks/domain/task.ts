import { AggregateRoot } from '../../../shared/ddd';
import { ArgumentInvalidError } from '../../../shared/errors';
import { TaskNotFoundError } from './errors';
import type { TaskStatus } from './task-status';
import type { TaskTitle } from './task-title';

export const MAX_TASK_DESCRIPTION_LENGTH = 10_000;
export const MAX_TASK_WATCHERS = 50;

export class InvalidTaskDescriptionError extends ArgumentInvalidError {}
export class InvalidTaskWatchersError extends ArgumentInvalidError {}
export class InvalidTaskStateError extends ArgumentInvalidError {}

export interface TaskProps {
    title: TaskTitle;
    description: string;
    status: TaskStatus;
    deadline: Date | null;
    creatorId: string;
    assigneeId: string | null;
    watcherIds: string[];
    completedAt: Date | null;
    deletedAt: Date | null;
}

export interface CreateTaskInput {
    id: string;
    title: TaskTitle;
    description?: string;
    deadline?: Date | null;
    creatorId: string;
    assigneeId?: string | null;
    watcherIds?: readonly string[];
    now: Date;
}

export interface RestoreTaskInput extends TaskProps {
    id: string;
    createdAt: Date;
    updatedAt: Date;
}

export class Task extends AggregateRoot<TaskProps> {
    static create(input: CreateTaskInput): Task {
        return new Task({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                title: input.title,
                description: input.description ?? '',
                status: 'todo',
                deadline: input.deadline ?? null,
                creatorId: input.creatorId,
                assigneeId: input.assigneeId ?? null,
                watcherIds: [...new Set(input.watcherIds ?? [])],
                completedAt: null,
                deletedAt: null,
            },
        });
    }

    static restore({ id, createdAt, updatedAt, ...props }: RestoreTaskInput): Task {
        return new Task({ id, createdAt, updatedAt, props: { ...props } });
    }

    get title(): TaskTitle {
        return this.props.title;
    }

    get description(): string {
        return this.props.description;
    }

    get status(): TaskStatus {
        return this.props.status;
    }

    get deadline(): Date | null {
        return this.props.deadline;
    }

    get creatorId(): string {
        return this.props.creatorId;
    }

    get assigneeId(): string | null {
        return this.props.assigneeId;
    }

    get watcherIds(): readonly string[] {
        return this.props.watcherIds;
    }

    get completedAt(): Date | null {
        return this.props.completedAt;
    }

    get deletedAt(): Date | null {
        return this.props.deletedAt;
    }

    isDeleted(): boolean {
        return this.props.deletedAt !== null;
    }

    rename(title: TaskTitle): void {
        this.assertNotDeleted();
        this.props.title = title;
        this.touch();
    }

    changeDescription(description: string): void {
        this.assertNotDeleted();
        assertDescription(description);
        this.props.description = description;
        this.touch();
    }

    changeDeadline(deadline: Date | null): void {
        this.assertNotDeleted();
        this.props.deadline = deadline;
        this.touch();
    }

    assign(assigneeId: string | null): void {
        this.assertNotDeleted();
        this.props.assigneeId = assigneeId;
        this.touch();
    }

    replaceWatchers(ids: readonly string[]): void {
        this.assertNotDeleted();
        const unique = [...new Set(ids)];
        assertWatchers(unique);
        this.props.watcherIds = unique;
        this.touch();
    }

    /** Any transition is allowed; completedAt follows the `done` status. */
    changeStatus(status: TaskStatus, now: Date): void {
        this.assertNotDeleted();
        if (status === 'done') {
            this.props.completedAt ??= now;
        } else {
            this.props.completedAt = null;
        }
        this.props.status = status;
        this.touch();
    }

    softDelete(now: Date): void {
        this.assertNotDeleted();
        this.props.deletedAt = now;
        this.touch();
    }

    /** Runs on every construction (create and restore), so an aggregate is always valid. */
    validate(): void {
        assertDescription(this.props.description);
        assertWatchers(this.props.watcherIds);
        if ((this.props.status === 'done') !== (this.props.completedAt !== null)) {
            throw new InvalidTaskStateError('completedAt must be set exactly when status is done');
        }
    }

    private assertNotDeleted(): void {
        if (this.isDeleted()) throw new TaskNotFoundError(this.id);
    }
}

function assertDescription(description: string): void {
    if (description.length > MAX_TASK_DESCRIPTION_LENGTH) {
        throw new InvalidTaskDescriptionError(
            `Task description is longer than ${String(MAX_TASK_DESCRIPTION_LENGTH)} characters`,
        );
    }
}

function assertWatchers(ids: readonly string[]): void {
    if (ids.length > MAX_TASK_WATCHERS) {
        throw new InvalidTaskWatchersError(
            `A task cannot have more than ${String(MAX_TASK_WATCHERS)} watchers`,
        );
    }
}
