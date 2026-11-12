import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BackendError } from "./errors";
import { FakeXhr } from "./fake-xhr.test-helper";
import { xhrUpload } from "./xhr-upload";

const ResultSchema = z.object({ id: z.string() });

class TooLarge extends BackendError {}
class Unsupported extends BackendError {}

/** Maps by status, the way an API module does. */
async function failure(response: Response): Promise<BackendError> {
  const { message } = (await response.json()) as { message: string };
  if (response.status === 413) return new TooLarge(message);
  if (response.status === 415) return new Unsupported(message);
  return new BackendError(message);
}

const file = () => new File(["hello"], "встреча.m4a", { type: "audio/mp4" });

describe("xhrUpload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the file as multipart field `file` to the backend path", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = xhrUpload("/files", { file: file(), schema: ResultSchema, failure });
    const xhr = FakeXhr.last;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("cc-api://backend/files");
    const sent = (xhr.body as FormData).get("file");
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe("встреча.m4a");
    xhr.finish(201, { id: "f1" });
    await expect(promise).resolves.toEqual({ id: "f1" });
  });

  it("reports progress as a fraction only when the total is known", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const onProgress = vi.fn();
    const promise = xhrUpload("/files", {
      file: file(),
      schema: ResultSchema,
      failure,
      options: { onProgress },
    });
    const xhr = FakeXhr.last;
    xhr.progress(25, 100);
    xhr.progress(5, 0, false);
    xhr.progress(100, 100);
    expect(onProgress.mock.calls).toEqual([[0.25], [1]]);
    xhr.finish(201, { id: "f1" });
    await promise;
  });

  it("aborts the request via signal and rejects with AbortError", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    const promise = xhrUpload("/files", {
      file: file(),
      schema: ResultSchema,
      failure,
      options: { signal: controller.signal },
    });
    controller.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once without sending when the signal is already aborted", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const controller = new AbortController();
    controller.abort();
    const before = FakeXhr.last;
    const promise = xhrUpload("/files", {
      file: file(),
      schema: ResultSchema,
      failure,
      options: { signal: controller.signal },
    });
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last).toBe(before);
  });

  it.each([
    [413, TooLarge, "Файл больше 50 МБ"],
    [415, Unsupported, "Этот тип файла не поддерживается"],
  ])("maps status %i through the failure mapper with the server message", async (status, errorClass, message) => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = xhrUpload("/files", { file: file(), schema: ResultSchema, failure });
    FakeXhr.last.finish(status, { message });
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(errorClass);
    expect((error as Error).message).toBe(message);
  });

  it("turns a network failure into a BackendError", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = xhrUpload("/files", { file: file(), schema: ResultSchema, failure });
    FakeXhr.last.fail();
    await expect(promise).rejects.toBeInstanceOf(BackendError);
  });

  it("rejects an unexpected success body", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const promise = xhrUpload("/files", { file: file(), schema: ResultSchema, failure });
    FakeXhr.last.finish(201, { nope: true });
    await expect(promise).rejects.toBeInstanceOf(BackendError);
  });
});
