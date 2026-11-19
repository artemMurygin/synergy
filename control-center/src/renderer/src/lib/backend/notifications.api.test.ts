/* eslint-disable @typescript-eslint/no-unused-vars -- test doubles: mocks, DOM stubs and fake transports of the test environment are typed loosely on purpose */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendError, NotificationNotFoundError } from "./errors";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.api";

const notification = {
  id: "n1",
  type: "task.assigned",
  title: "Новая задача",
  body: "Текст",
  target: { type: "task", id: "t1" },
  actorId: null,
  createdAt: "2026-11-10T10:00:00.000Z",
  readAt: null,
};
const page = { items: [notification], total: 1, limit: 20, page: 0 };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("notifications.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listNotifications", () => {
    it("requests the 0-based page with the limit", async () => {
      const fn = stubFetch(json(page));
      await expect(listNotifications({ page: 2, limit: 20 })).resolves.toEqual(page);
      const url = new URL(fn.mock.calls[0][0]);
      expect(fn.mock.calls[0][0].split("?")[0]).toBe("cc-api://backend/notifications");
      expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", limit: "20" });
    });

    it("adds unreadOnly only when asked", async () => {
      const fn = stubFetch(json(page));
      await listNotifications({ page: 0, limit: 20, unreadOnly: true });
      expect(new URL(fn.mock.calls[0][0]).searchParams.get("unreadOnly")).toBe("true");
    });

    it("rejects an unexpected body", async () => {
      stubFetch(json({ items: [{ id: "n1" }] }));
      await expect(listNotifications({ page: 0, limit: 20 })).rejects.toBeInstanceOf(BackendError);
    });

    it("maps a server error to BackendError with its message", async () => {
      stubFetch(json({ message: "Сервис недоступен" }, 503));
      const error = await listNotifications({ page: 0, limit: 20 }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BackendError);
      expect(error instanceof Error && error.message).toBe("Сервис недоступен");
    });
  });

  it("getUnreadCount reads the counter", async () => {
    const fn = stubFetch(json({ unreadCount: 4 }));
    await expect(getUnreadCount()).resolves.toEqual({ unreadCount: 4 });
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/notifications/unread-count");
  });

  it("markNotificationRead posts to the encoded id and returns the counter", async () => {
    const fn = stubFetch(json({ unreadCount: 2 }));
    await expect(markNotificationRead("n/1")).resolves.toEqual({ unreadCount: 2 });
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/notifications/n%2F1/read");
    expect(fn.mock.calls[0][1]?.method).toBe("POST");
  });

  it("markNotificationRead maps 404 to NotificationNotFoundError", async () => {
    stubFetch(json({ message: "Notification not found" }, 404));
    await expect(markNotificationRead("n1")).rejects.toBeInstanceOf(NotificationNotFoundError);
  });

  it("markAllNotificationsRead posts read-all", async () => {
    const fn = stubFetch(json({ unreadCount: 0 }));
    await expect(markAllNotificationsRead()).resolves.toEqual({ unreadCount: 0 });
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/notifications/read-all");
    expect(fn.mock.calls[0][1]?.method).toBe("POST");
  });

  it("reports an unreachable server as BackendError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(getUnreadCount()).rejects.toBeInstanceOf(BackendError);
  });
});
