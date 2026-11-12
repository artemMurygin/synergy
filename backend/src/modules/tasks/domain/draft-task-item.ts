import { MAX_TASK_DESCRIPTION_LENGTH, MAX_TASK_WATCHERS } from './task';
import { InvalidTaskBatchError } from './task-batch-errors';
import { TaskTitle } from './task-title';

export interface DraftTaskItemInput {
    title: string;
    description?: string;
    deadline?: Date | null;
    assigneeId?: string | null;
    creatorId: string;
    watcherIds?: readonly string[];
    /** Пометка об источнике, например цитата и таймкод из встречи. */
    sourceNote?: string | null;
}

/** Карточка задачи черновика. Пользователи в ней уже проверены при создании черновика. */
export interface DraftTaskItem {
    readonly title: TaskTitle;
    readonly description: string;
    readonly deadline: Date | null;
    readonly assigneeId: string | null;
    /** Постановщик. */
    readonly creatorId: string;
    readonly watcherIds: readonly string[];
    readonly sourceNote: string | null;
}

export const DraftTaskItem = {
    of(input: DraftTaskItemInput): DraftTaskItem {
        const description = input.description ?? '';
        if (description.length > MAX_TASK_DESCRIPTION_LENGTH) {
            throw new InvalidTaskBatchError(
                `Task description is longer than ${String(MAX_TASK_DESCRIPTION_LENGTH)} characters`,
            );
        }
        if (input.creatorId.trim() === '') {
            throw new InvalidTaskBatchError('Task creator must not be empty');
        }
        const watcherIds = [...new Set(input.watcherIds ?? [])];
        if (watcherIds.length > MAX_TASK_WATCHERS) {
            throw new InvalidTaskBatchError(
                `A task cannot have more than ${String(MAX_TASK_WATCHERS)} watchers`,
            );
        }
        const sourceNote = input.sourceNote?.trim() ?? '';
        return Object.freeze({
            title: TaskTitle.of(input.title),
            description,
            deadline: input.deadline ?? null,
            assigneeId: input.assigneeId ?? null,
            creatorId: input.creatorId,
            watcherIds: Object.freeze(watcherIds),
            sourceNote: sourceNote === '' ? null : sourceNote,
        });
    },
};
