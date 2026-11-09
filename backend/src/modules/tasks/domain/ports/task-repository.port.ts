import type { Task } from '../task';
import type { TaskFilter } from '../task-filter';
import type { TaskSort } from '../task-sort';

export interface TaskPageRequest {
    /** Page size. */
    limit: number;
    /** Zero-based page number. */
    page: number;
}

export interface TaskPage {
    items: Task[];
    /** Number of tasks matching the filter across all pages. */
    total: number;
}

export abstract class TaskRepository {
    /** Returns the task with its watchers; soft-deleted tasks are not returned. */
    abstract findById(id: string): Promise<Task | null>;
    /** Inserts or updates by id, replacing the watcher set. */
    abstract save(task: Task): Promise<void>;
    /** Page of non-deleted tasks matching the filter (AND), ordered by `sort`. */
    abstract list(filter: TaskFilter, sort: TaskSort, page: TaskPageRequest): Promise<TaskPage>;
}
