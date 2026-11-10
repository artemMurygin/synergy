import { describe, expect, it } from "vitest";
import {
  MarkReadResultSchema,
  NotificationPageSchema,
  NotificationSchema,
  UnreadCountSchema,
} from "./notifications.schema";

const notification = {
  id: "n1",
  type: "task.assigned",
  title: "Новая задача",
  body: "anna назначила вам задачу «Отчёт»",
  target: { type: "task", id: "t1" },
  actorId: "u2",
  createdAt: "2026-11-10T10:00:00.000Z",
  readAt: null,
};

describe("notifications.schema", () => {
  it("parses a notification, allowing null actor and readAt", () => {
    expect(NotificationSchema.parse(notification)).toEqual(notification);
    const read = { ...notification, actorId: null, readAt: "2026-11-10T10:05:00.000Z" };
    expect(NotificationSchema.parse(read)).toEqual(read);
  });

  it("keeps an unknown type so newer notifications still render", () => {
    const future = { ...notification, type: "task.commented" };
    expect(NotificationSchema.parse(future).type).toBe("task.commented");
  });

  it("rejects a notification without a target or with a bad date", () => {
    expect(NotificationSchema.safeParse({ ...notification, target: null }).success).toBe(false);
    expect(NotificationSchema.safeParse({ ...notification, target: { type: "task" } }).success).toBe(false);
    expect(NotificationSchema.safeParse({ ...notification, createdAt: "вчера" }).success).toBe(false);
  });

  it("parses a page", () => {
    const page = { items: [notification], total: 30, limit: 20, page: 0 };
    expect(NotificationPageSchema.parse(page)).toEqual(page);
    expect(NotificationPageSchema.safeParse({ ...page, items: "x" }).success).toBe(false);
  });

  it("requires a non-negative integer unread count", () => {
    expect(UnreadCountSchema.parse({ unreadCount: 3 })).toEqual({ unreadCount: 3 });
    expect(UnreadCountSchema.safeParse({ unreadCount: -1 }).success).toBe(false);
    expect(UnreadCountSchema.safeParse({ unreadCount: 1.5 }).success).toBe(false);
    expect(MarkReadResultSchema.parse({ unreadCount: 0 })).toEqual({ unreadCount: 0 });
  });
});
