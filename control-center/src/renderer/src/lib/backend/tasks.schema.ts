import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** `login` is null when the user has been deactivated. */
export const TaskUserSchema = z.object({
  id: z.string(),
  login: z.string().nullable(),
});
export type TaskUser = z.infer<typeof TaskUserSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(TASK_STATUSES),
  deadline: z.string().nullable(),
  creator: TaskUserSchema,
  assignee: TaskUserSchema.nullable(),
  watchers: z.array(TaskUserSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  attachmentCount: z.number().int().min(0),
});
export type Task = z.infer<typeof TaskSchema>;

export const AttachmentSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  originalName: z.string(),
  sizeBytes: z.number(),
  contentType: z.string(),
  uploadedBy: z.string(),
  createdAt: z.string(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const TaskDetailsSchema = TaskSchema.extend({
  attachments: z.array(AttachmentSchema),
});
export type TaskDetails = z.infer<typeof TaskDetailsSchema>;

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    limit: z.number(),
    page: z.number(),
  });

export const TaskPageSchema = pageOf(TaskSchema);
export type TaskPage = z.infer<typeof TaskPageSchema>;

/** A user as returned by GET /users: id and login only. */
export const UserSummarySchema = z.object({
  id: z.string(),
  login: z.string(),
});
export type UserSummary = z.infer<typeof UserSummarySchema>;

export const UserPageSchema = pageOf(UserSummarySchema);
export type UserPage = z.infer<typeof UserPageSchema>;
