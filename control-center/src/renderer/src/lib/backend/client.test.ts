import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./client";
import { BackendError, RunConflictError, ThreadNotFoundError } from "./errors";

function stubFetch(response: Response | Error) {
  const fn = vi.fn(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls cc-api://backend with the path and init", async () => {
    const fn = stubFetch(new Response("{}", { status: 200 }));
    const response = await request("/threads", { method: "POST" });
    expect(response.ok).toBe(true);
    expect(fn).toHaveBeenCalledWith("cc-api://backend/threads", {
      method: "POST",
    });
  });

  it("throws ThreadNotFoundError on 404", async () => {
    stubFetch(
      new Response(JSON.stringify({ message: "нет чата" }), { status: 404 }),
    );
    const error = await request("/threads/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ThreadNotFoundError);
    expect((error as Error).message).toBe("нет чата");
  });

  it("throws RunConflictError on 409", async () => {
    stubFetch(
      new Response(JSON.stringify({ message: "занято" }), { status: 409 }),
    );
    await expect(request("/agent")).rejects.toBeInstanceOf(RunConflictError);
  });

  it("throws BackendError with the server message on other non-2xx", async () => {
    stubFetch(
      new Response(JSON.stringify({ message: "плохой запрос" }), {
        status: 400,
      }),
    );
    const error = await request("/threads").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect(error).not.toBeInstanceOf(ThreadNotFoundError);
    expect((error as Error).message).toBe("плохой запрос");
  });

  it("falls back to a status line when the body is not JSON", async () => {
    stubFetch(new Response("boom", { status: 500 }));
    await expect(request("/threads")).rejects.toThrow(
      "Сервер ответил ошибкой 500",
    );
  });

  it("throws BackendError on network failure", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    const error = await request("/threads").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendError);
    expect((error as Error).message).toMatch(
      /^Не удалось связаться с сервером/,
    );
  });
});
