import { z } from 'zod';
import { paginationQuerySchema } from '../../../../shared/http/pagination.schema';
import { TASK_SORT_DIRECTIONS, TASK_SORT_FIELDS } from '../../domain/task-sort';
import { TASK_STATUSES } from '../../domain/task-status';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10000;
// The 50-watcher limit is enforced by the aggregate after de-duplication; this only bounds the payload.
const MAX_WATCHER_INPUT = 200;

const title = z.string().trim().min(1).max(MAX_TITLE_LENGTH);
const description = z.string().max(MAX_DESCRIPTION_LENGTH);
/** ISO 8601 with a time zone; the controller turns it into a Date. */
const deadline = z.iso.datetime({ offset: true });
const userId = z.uuid();
const watcherIds = z.array(userId).max(MAX_WATCHER_INPUT);

export const createTaskRequestSchema = z.object({
    title,
    description: description.optional(),
    deadline: deadline.nullable().optional(),
    assigneeId: userId.nullable().optional(),
    watcherIds: watcherIds.optional(),
});
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;

export const updateTaskRequestSchema = z
    .object({
        title: title.optional(),
        description: description.optional(),
        status: z.enum(TASK_STATUSES).optional(),
        deadline: deadline.nullable().optional(),
        assigneeId: userId.nullable().optional(),
        watcherIds: watcherIds.optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, {
        message: 'At least one field must be provided',
    });
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;

export const listTasksQuerySchema = paginationQuerySchema.extend({
    status: z.enum(TASK_STATUSES).optional(),
    creatorId: userId.optional(),
    assigneeId: userId.optional(),
    watcherId: userId.optional(),
    overdue: z.enum(['true', 'false']).optional(),
    search: z.string().max(MAX_TITLE_LENGTH).optional(),
    sort: z.enum(TASK_SORT_FIELDS).optional(),
    order: z.enum(TASK_SORT_DIRECTIONS).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
