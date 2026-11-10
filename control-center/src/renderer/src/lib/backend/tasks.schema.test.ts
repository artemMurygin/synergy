import { describe, expect, it } from "vitest";
import {
  AttachmentSchema,
  TaskDetailsSchema,
  TaskPageSchema,
  TaskSchema,
  UserPageSchema,
} from "./tasks.schema";

const ID = "2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231";

const task = {
  id: ID,
  title: "Подготовить КП",
  description: "",
  status: "todo",
  deadline: "2026-12-01T09:00:00.000Z",
  creator: { id: ID, login: "anna" },
  assignee: { id: ID, login: null },
  watchers: [{ id: ID, login: "boris" }],
  createdAt: "2026-11-06T10:00:00.000Z",
  updatedAt: "2026-11-06T10:05:00.000Z",
  completedAt: null,
  attachmentCount: 2,
};

const attachment = {
  id: ID,
  taskId: ID,
  originalName: "Прайс 2026.pdf",
  sizeBytes: 52311,
  contentType: "application/pdf",
  uploadedBy: ID,
  createdAt: "2026-11-06T10:00:00.000Z",
};

describe("tasks.schema", () => {
  it("parses a task, allowing null deadline, assignee and login", () => {
    expect(TaskSchema.parse(task)).toEqual(task);
    const bare = { ...task, deadline: null, assignee: null, watchers: [] };
    expect(TaskSchema.parse(bare)).toEqual(bare);
  });

  it("requires a non-negative integer attachmentCount", () => {
    const { attachmentCount: _c, ...missing } = task;
    expect(TaskSchema.safeParse(missing).success).toBe(false);
    expect(TaskSchema.safeParse({ ...task, attachmentCount: -1 }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...task, attachmentCount: 1.5 }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...task, attachmentCount: 0 }).success).toBe(true);
  });

  it("rejects an unknown status and a missing creator", () => {
    expect(TaskSchema.safeParse({ ...task, status: "blocked" }).success).toBe(false);
    const { creator: _creator, ...noCreator } = task;
    expect(TaskSchema.safeParse(noCreator).success).toBe(false);
  });

  it("parses an attachment and rejects a non-numeric size", () => {
    expect(AttachmentSchema.parse(attachment)).toEqual(attachment);
    expect(AttachmentSchema.safeParse({ ...attachment, sizeBytes: "1" }).success).toBe(false);
  });

  it("parses task details with attachments and requires the array", () => {
    expect(TaskDetailsSchema.parse({ ...task, attachments: [attachment] }).attachments).toHaveLength(1);
    expect(TaskDetailsSchema.safeParse(task).success).toBe(false);
  });

  it("parses a task page", () => {
    const page = { items: [task], total: 1, limit: 20, page: 0 };
    expect(TaskPageSchema.parse(page)).toEqual(page);
    expect(TaskPageSchema.safeParse({ items: [task], total: 1 }).success).toBe(false);
    expect(TaskPageSchema.safeParse({ ...page, items: [{ id: ID }] }).success).toBe(false);
  });

  it("parses a user page with only id and login", () => {
    const page = { items: [{ id: ID, login: "anna" }], total: 1, limit: 20, page: 0 };
    expect(UserPageSchema.parse(page)).toEqual(page);
    expect(UserPageSchema.safeParse({ ...page, items: [{ id: ID }] }).success).toBe(false);
  });
});
