import { HttpAgent } from "@ag-ui/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent } from "./agent";
import { BackendError } from "./errors";
import {
  cancelRun,
  createThread,
  deleteThread,
  getThreadHistory,
  listThreads,
  renameThread,
} from "./threads.api";

const thread = {
  id: "t1",
  title: "Чат",
  createdAt: "2026-01-01T00:00:00Z",
  lastActivityAt: "2026-01-02T00:00:00Z",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("threads.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listThreads parses an array", async () => {
    const fn = stubFetch(json([thread]));
    const threads = await listThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: "t1",
      running: false,
      titleIsCustom: false,
    });
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/threads");
  });

  it("listThreads rejects an unexpected format", async () => {
    stubFetch(json({ nope: true }));
    await expect(listThreads()).rejects.toBeInstanceOf(BackendError);
    stubFetch(json([{ id: "t1" }]));
    await expect(listThreads()).rejects.toBeInstanceOf(BackendError);
  });

  it("createThread sends a body only with a title", async () => {
    const fn = stubFetch(json(thread, 201));
    await createThread();
    expect(fn.mock.calls[0][1]?.method).toBe("POST");
    expect(fn.mock.calls[0][1]?.body).toBeUndefined();

    const withTitle = stubFetch(json(thread, 201));
    await createThread("Новый");
    expect(withTitle.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ title: "Новый" }),
    );
  });

  it("getThreadHistory requests messages", async () => {
    const fn = stubFetch(
      json({
        messages: [{ id: "m1", role: "user", content: "hi" }],
        running: true,
      }),
    );
    const history = await getThreadHistory("a/b");
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/threads/a%2Fb/messages");
    expect(history.running).toBe(true);
    expect(history.messages).toHaveLength(1);
  });

  it("renameThread sends PATCH", async () => {
    const fn = stubFetch(
      json({ ...thread, title: "Нов", titleIsCustom: true }),
    );
    const result = await renameThread("t1", "Нов");
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/threads/t1");
    expect(fn.mock.calls[0][1]?.method).toBe("PATCH");
    expect(fn.mock.calls[0][1]?.body).toBe(JSON.stringify({ title: "Нов" }));
    expect(result.titleIsCustom).toBe(true);
  });

  it("deleteThread sends DELETE", async () => {
    const fn = stubFetch(new Response(null, { status: 204 }));
    await deleteThread("t1");
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/threads/t1");
    expect(fn.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it.each([204, 404])("cancelRun treats %i as success", async (status) => {
    const fn = stubFetch(new Response(null, { status }));
    await expect(cancelRun("t1")).resolves.toBeUndefined();
    expect(fn.mock.calls[0][0]).toBe("cc-api://backend/threads/t1/run/cancel");
    expect(fn.mock.calls[0][1]?.method).toBe("POST");
  });

  it("cancelRun fails on other errors", async () => {
    stubFetch(json({ message: "сбой" }, 500));
    await expect(cancelRun("t1")).rejects.toThrow("сбой");
  });
});

describe("createAgent", () => {
  it("creates an HttpAgent bound to the thread", () => {
    const agent = createAgent("t1");
    expect(agent).toBeInstanceOf(HttpAgent);
    expect(agent.threadId).toBe("t1");
    expect(agent.url).toBe("cc-api://backend/agent");
  });
});
