import type { AttachmentView } from './attachment-view';
import type { UserDirectory } from '../domain/ports/user-directory.port';
import { TaskUserNotFoundError } from '../domain/errors';
import type { Task } from '../domain/task';
import type { TaskStatus } from '../domain/task-status';

/** A user as shown in a task; `login` is null when the user is no longer active. */
export interface TaskUserRef {
    id: string;
    login: string | null;
}

export interface TaskView {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    deadline: Date | null;
    creator: TaskUserRef;
    assignee: TaskUserRef | null;
    watchers: TaskUserRef[];
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    /** Number of attachments of the task, >= 0. */
    attachmentCount: number;
}

export type TaskSummary = TaskView;

/** A single task with the metadata of its attachments (GET /tasks/{id}). */
export interface TaskDetailsView extends TaskView {
    attachments: AttachmentView[];
}

export async function assertActiveUsers(
    directory: UserDirectory,
    ids: readonly (string | null | undefined)[],
): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (wanted.length === 0) return;
    const found = new Set((await directory.findActiveByIds(wanted)).map((user) => user.id));
    const missing = wanted.filter((id) => !found.has(id));
    if (missing.length > 0) throw new TaskUserNotFoundError(missing);
}

/**
 * Resolves participants of all tasks with a single directory lookup.
 * `attachmentCounts` maps task id to its attachment count; a missing entry means 0.
 */
export async function toTaskViews(
    tasks: readonly Task[],
    directory: UserDirectory,
    attachmentCounts: ReadonlyMap<string, number> = new Map(),
): Promise<TaskView[]> {
    const ids = new Set<string>();
    for (const task of tasks) {
        ids.add(task.creatorId);
        if (task.assigneeId !== null) ids.add(task.assigneeId);
        for (const id of task.watcherIds) ids.add(id);
    }
    const logins = new Map<string, string>();
    if (ids.size > 0) {
        for (const user of await directory.findActiveByIds([...ids])) {
            logins.set(user.id, user.login);
        }
    }
    const ref = (id: string): TaskUserRef => ({ id, login: logins.get(id) ?? null });
    return tasks.map((task) => ({
        id: task.id,
        title: task.title.value,
        description: task.description,
        status: task.status,
        deadline: task.deadline,
        creator: ref(task.creatorId),
        assignee: task.assigneeId === null ? null : ref(task.assigneeId),
        watchers: task.watcherIds.map(ref),
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedAt: task.completedAt,
        attachmentCount: attachmentCounts.get(task.id) ?? 0,
    }));
}

export async function toTaskView(
    task: Task,
    directory: UserDirectory,
    attachmentCount = 0,
): Promise<TaskView> {
    const [view] = await toTaskViews([task], directory, new Map([[task.id, attachmentCount]]));
    return view;
}
