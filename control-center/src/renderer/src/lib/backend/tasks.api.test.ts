import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  BackendError,
  TaskNotFoundError,
  TaskUserNotFoundError,
} from "./errors";
import {
  createTask,
  deleteAttachment,
  deleteTask,
  downloadAttachment,
  getTask,
  listTasks,
  updateTask,
  uploadAttachment,
} from "./tasks.api";

const ID = "2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231";
const task = {
  id: ID,
  title: "Т",
  description: "",
  status: "todo",
  deadline: null,
  creator: { id: ID, login: "anna" },
  assignee: null,
  watchers: [],
  createdAt: "2026-11-06T10:00:00.000Z",
  updatedAt: "2026-11-06T10:00:00.000Z",
  completedAt: null,
  attachmentCount: 0,
};
const attachment = {
  id: ID,
  taskId: ID,
  originalName: "a.txt",
  sizeBytes: 1,
  contentType: "text/plain",
  uploadedBy: ID,
  createdAt: "2026-11-06T10:00:00.000Z",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const calledUrl = (fn: ReturnType<typeof stubFetch>): URL =>
  new URL(fn.mock.calls[0][0]);

describe("tasks.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listTasks", () => {
    const page = { items: [task], total: 1, limit: 20, page: 0 };

    it("builds the query from filters and omits unset ones", async () => {
      const fn = stubFetch(json(page));
      await listTasks({
        status: "todo",
        assigneeId: "u1",
        overdue: true,
        search: "кп",
        sort: "deadline",
        order: "asc",
        limit: 50,
        page: 2,
      });
      const url = calledUrl(fn);
      expect(fn.mock.calls[0][0].split("?")[0]).toBe("cc-api://backend/tasks");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        status: "todo",
        assigneeId: "u1",
        overdue: "true",
        search: "кп",
        sort: "deadline",
        order: "asc",
        limit: "50",
        page: "2",
      });
    });

    it("sends overdue=false and no query for empty filters", async () => {
      const fn = stubFetch(json(page));
      await listTasks({ overdue: false });
      expect(calledUrl(fn).searchParams.get("overdue")).toBe("false");
      stubFetch(json(page));
      const fn2 = stubFetch(json(page));
      await listTasks({});
      expect(fn2.mock.calls[0][0]).toBe("cc-api://backend/tasks");
    });

    it("rejects an unexpected body", async () => {
      stubFetch(json({ items: "x" }));
      await expect(listTasks({})).rejects.toBeInstanceOf(BackendError);
    });
  });

  it("getTask maps 404 to TaskNotFoundError", async () => {
    stubFetch(json({ message: "Task not found" }, 404));
    const error = await getTask(ID).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TaskNotFoundError);
    expect((error as Error).message).toBe("Task not found");
  });

  it("getTask parses details", async () => {
    const fn = stubFetch(json({ ...task, attachments: [attachment] }));
    expect((await getTask(ID)).attachments).toHaveLength(1);
    expect(fn.mock.calls[0][0]).toBe(`cc-api://backend/tasks/${ID}`);
  });

  it("createTask posts JSON", async () => {
    const fn = stubFetch(json(task, 201));
    await createTask({ title: "Т", assigneeId: null });
    const init = fn.mock.calls[0][1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ title: "Т", assigneeId: null });
  });

  it("updateTask sends only the given fields, keeping null", async () => {
    const fn = stubFetch(json(task));
    await updateTask(ID, { deadline: null, assigneeId: null, status: "done" });
    const init = fn.mock.calls[0][1];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      deadline: null,
      assigneeId: null,
      status: "done",
    });
  });

  it("maps 422 TASK_USER_NOT_FOUND to TaskUserNotFoundError", async () => {
    stubFetch(json({ message: "no user", code: "TASK_USER_NOT_FOUND" }, 422));
    await expect(createTask({ title: "Т" })).rejects.toBeInstanceOf(TaskUserNotFoundError);
    stubFetch(json({ message: "no user", code: "TASK_USER_NOT_FOUND" }, 422));
    await expect(updateTask(ID, { title: "x" })).rejects.toBeInstanceOf(TaskUserNotFoundError);
  });

  it("maps other 4xx/5xx to a plain BackendError", async () => {
    stubFetch(json({ message: "bad" }, 400));
    const error = await createTask({ title: "Т" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).not.toBeInstanceOf(TaskNotFoundError);
    stubFetch(json({ message: "boom" }, 500));
    await expect(deleteTask(ID)).rejects.toBeInstanceOf(BackendError);
  });

  it("wraps a network failure in BackendError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("x"))));
    await expect(getTask(ID)).rejects.toBeInstanceOf(BackendError);
  });

  it("deleteTask issues DELETE and maps 404", async () => {
    const fn = stubFetch(new Response(null, { status: 204 }));
    await deleteTask(ID);
    expect(fn.mock.calls[0][1]?.method).toBe("DELETE");
    stubFetch(json({ message: "gone" }, 404));
    await expect(deleteTask(ID)).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  describe("attachments", () => {
    it("deleteAttachment issues DELETE and maps 404", async () => {
      const fn = stubFetch(new Response(null, { status: 204 }));
      await deleteAttachment(ID, "a1");
      expect(fn.mock.calls[0][0]).toBe(`cc-api://backend/tasks/${ID}/attachments/a1`);
      expect(fn.mock.calls[0][1]?.method).toBe("DELETE");
      stubFetch(json({ message: "gone" }, 404));
      await expect(deleteAttachment(ID, "a1")).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it("downloadAttachment takes the name from filename*", async () => {
      const name = "Прайс 2026 (1).pdf";
      const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      stubFetch(
        new Response("data", {
          headers: {
            "content-disposition": `attachment; filename="_____ 2026 _1_.pdf"; filename*=UTF-8''${encoded}`,
          },
        }),
      );
      const result = await downloadAttachment(ID, "a1");
      expect(result.fileName).toBe(name);
      expect(await result.blob.text()).toBe("data");
    });

    it("downloadAttachment falls back to filename, then to a default", async () => {
      stubFetch(new Response("d", { headers: { "content-disposition": 'attachment; filename="a.txt"' } }));
      expect((await downloadAttachment(ID, "a1")).fileName).toBe("a.txt");
      stubFetch(new Response("d"));
      expect((await downloadAttachment(ID, "a1")).fileName).toBe("attachment");
    });

    it("downloadAttachment maps 404", async () => {
      stubFetch(json({ message: "gone" }, 404));
      await expect(downloadAttachment(ID, "a1")).rejects.toBeInstanceOf(TaskNotFoundError);
    });
  });

  describe("uploadAttachment", () => {
    class FakeXhr {
      static last: FakeXhr;
      upload = { listeners: {} as Record<string, (e: unknown) => void> } as {
        listeners: Record<string, (e: unknown) => void>;
        addEventListener: (t: string, l: (e: unknown) => void) => void;
      };
      listeners: Record<string, () => void> = {};
      status = 0;
      responseText = "";
      method = "";
      url = "";
      body: unknown = null;
      aborted = false;
      constructor() {
        FakeXhr.last = this;
        this.upload.addEventListener = (t, l) => {
          this.upload.listeners[t] = l;
        };
      }
      open(method: string, url: string) {
        this.method = method;
        this.url = url;
      }
      addEventListener(t: string, l: () => void) {
        this.listeners[t] = l;
      }
      send(body: unknown) {
        this.body = body;
      }
      abort() {
        this.aborted = true;
        this.listeners.abort?.();
      }
      finish(status: number, body: unknown) {
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.listeners.load?.();
      }
    }
    const file = () => new File(["hello"], "a.txt", { type: "text/plain" });

    it("posts multipart to the task and reports progress", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const onProgress = vi.fn();
      const promise = uploadAttachment(ID, file(), { onProgress });
      const xhr = FakeXhr.last;
      expect(xhr.method).toBe("POST");
      expect(xhr.url).toBe(`cc-api://backend/tasks/${ID}/attachments`);
      expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);
      xhr.upload.listeners.progress({ lengthComputable: true, loaded: 5, total: 10 });
      expect(onProgress).toHaveBeenCalledWith(0.5);
      xhr.finish(201, attachment);
      expect(await promise).toEqual(attachment);
    });

    it.each([
      [413, { message: "big" }, AttachmentTooLargeError],
      [422, { message: "limit", code: "TASK_ATTACHMENT_LIMIT" }, AttachmentLimitError],
      [404, { message: "gone" }, TaskNotFoundError],
      [500, { message: "boom" }, BackendError],
    ])("maps status %i", async (status, body, errorClass) => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadAttachment(ID, file());
      FakeXhr.last.finish(status, body);
      await expect(promise).rejects.toBeInstanceOf(errorClass);
    });

    it("aborts via signal and rejects with AbortError", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const controller = new AbortController();
      const promise = uploadAttachment(ID, file(), { signal: controller.signal });
      controller.abort();
      expect(FakeXhr.last.aborted).toBe(true);
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    });
  });
});
