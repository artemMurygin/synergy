import { AggregateRoot } from '../../../shared/ddd';
import type { DraftOrigin } from './draft-origin';
import type { DraftTaskItem } from './draft-task-item';
import { DraftAlreadyUsedError, InvalidTaskBatchError, assertBatchSize } from './task-batch-errors';
import type { TaskBatchResult } from './task-batch-result';

export const TASK_BATCH_DRAFT_STATUSES = ['draft', 'superseded', 'consumed'] as const;
export type TaskBatchDraftStatus = (typeof TASK_BATCH_DRAFT_STATUSES)[number];

export interface TaskBatchDraftProps {
    ownerId: string;
    /** Thread агента (id чата), в котором согласован список. */
    threadId: string;
    items: readonly DraftTaskItem[];
    origin: DraftOrigin | null;
    status: TaskBatchDraftStatus;
    result: TaskBatchResult | null;
}

export interface CreateTaskBatchDraftInput {
    id: string;
    ownerId: string;
    threadId: string;
    items: readonly DraftTaskItem[];
    origin: DraftOrigin | null;
    now: Date;
}

export interface RestoreTaskBatchDraftInput extends TaskBatchDraftProps {
    id: string;
    createdAt: Date;
}

/**
 * Согласованный с пользователем список задач. Задачи по нему создаются один раз: `consume`
 * переводит черновик из `draft` в `consumed`, повтор бросает `DraftAlreadyUsedError`.
 */
export class TaskBatchDraft extends AggregateRoot<TaskBatchDraftProps> {
    static create(input: CreateTaskBatchDraftInput): TaskBatchDraft {
        return new TaskBatchDraft({
            id: input.id,
            createdAt: input.now,
            updatedAt: input.now,
            props: {
                ownerId: input.ownerId,
                threadId: input.threadId,
                items: Object.freeze([...input.items]),
                origin: input.origin,
                status: 'draft',
                result: null,
            },
        });
    }

    static restore({ id, createdAt, ...props }: RestoreTaskBatchDraftInput): TaskBatchDraft {
        return new TaskBatchDraft({
            id,
            createdAt,
            updatedAt: createdAt,
            props: {
                ownerId: props.ownerId,
                threadId: props.threadId,
                items: Object.freeze([...props.items]),
                origin: props.origin,
                status: props.status,
                result: props.result,
            },
        });
    }

    get ownerId(): string {
        return this.props.ownerId;
    }

    get threadId(): string {
        return this.props.threadId;
    }

    get items(): readonly DraftTaskItem[] {
        return this.props.items;
    }

    get origin(): DraftOrigin | null {
        return this.props.origin;
    }

    get status(): TaskBatchDraftStatus {
        return this.props.status;
    }

    get result(): TaskBatchResult | null {
        return this.props.result;
    }

    /** Отдаёт задачи для создания. Только один раз и только из `draft`. */
    consume(): readonly DraftTaskItem[] {
        if (this.props.status !== 'draft') {
            throw new DraftAlreadyUsedError(this.id, this.props.status);
        }
        this.props.status = 'consumed';
        this.touch();
        return this.props.items;
    }

    /** Новый черновик в том же thread заменяет этот. */
    supersede(): void {
        if (this.props.status !== 'draft') return;
        this.props.status = 'superseded';
        this.touch();
    }

    recordResult(result: TaskBatchResult): void {
        if (this.props.status !== 'consumed') {
            throw new InvalidTaskBatchError('A result is recorded only for a consumed draft');
        }
        this.props.result = result;
        this.touch();
    }

    validate(): void {
        assertBatchSize(this.props.items.length);
    }
}
