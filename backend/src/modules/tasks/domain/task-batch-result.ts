import { InvalidTaskBatchError } from './task-batch-errors';

/** Итог создания одной задачи черновика; `index` — номер карточки, с 1. */
export type TaskBatchResultItem =
    | { readonly index: number; readonly status: 'created'; readonly taskId: string }
    | { readonly index: number; readonly status: 'failed'; readonly reason: string };

/** Итог создания задач по черновику: по строке на каждую задачу. */
export interface TaskBatchResult {
    readonly items: readonly TaskBatchResultItem[];
    readonly createdCount: number;
    readonly failedCount: number;
}

export const TaskBatchResult = {
    of(items: readonly TaskBatchResultItem[]): TaskBatchResult {
        const seen = new Set<number>();
        for (const item of items) {
            if (!Number.isInteger(item.index) || item.index < 1) {
                throw new InvalidTaskBatchError('Task index must be a positive integer');
            }
            if (seen.has(item.index)) {
                throw new InvalidTaskBatchError(`Task index ${String(item.index)} is repeated`);
            }
            seen.add(item.index);
        }
        const frozen = Object.freeze(items.map((item) => Object.freeze({ ...item })));
        const createdCount = frozen.filter((item) => item.status === 'created').length;
        return Object.freeze({
            items: frozen,
            createdCount,
            failedCount: frozen.length - createdCount,
        });
    },
};
