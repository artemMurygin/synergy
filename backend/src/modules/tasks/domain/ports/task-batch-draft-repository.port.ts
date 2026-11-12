import type { TaskBatchDraft } from '../task-batch-draft';
import type { TaskBatchResult } from '../task-batch-result';

export abstract class TaskBatchDraftRepository {
    /** Вставляет новый черновик. У thread может быть только один черновик в статусе `draft`. */
    abstract save(draft: TaskBatchDraft): Promise<void>;

    /** Черновик владельца; чужой и несуществующий неразличимы (`null`). */
    abstract findById(id: string, ownerId: string): Promise<TaskBatchDraft | null>;

    /** Переводит черновик thread в статусе `draft` в `superseded`. */
    abstract supersedeActive(threadId: string, ownerId: string): Promise<void>;

    /**
     * Атомарно переводит черновик из `draft` в `consumed`. `false`, если черновик уже не в
     * `draft` или не принадлежит владельцу: из двух параллельных вызовов `true` получит один.
     */
    abstract consume(id: string, ownerId: string): Promise<boolean>;

    abstract saveResult(id: string, result: TaskBatchResult): Promise<void>;
}
