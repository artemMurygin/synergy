import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendError,
  FileGoneError,
  FileNotFoundError,
  FileTooLargeError,
  UnsupportedFileTypeError,
} from "./errors";
import { FakeXhr } from "./fake-xhr.test-helper";
import { createDownloadLink, uploadFile } from "./files.api";

const ID = "2cdc8ab1-6d50-49cc-ba14-54e4ac7ec231";
const storedFile = {
  id: ID,
  name: "встреча.m4a",
  mediaType: "audio/mp4",
  kind: "recording",
  sizeBytes: 88_080_384,
  status: "active",
  awaitingProcessing: true,
  uploadedAt: "2026-11-12T10:00:00.000Z",
  expiresAt: null,
  deletedAt: null,
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

function stubFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const recording = () => new File(["audio"], "встреча.m4a", { type: "audio/mp4" });

describe("files.api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("uploadFile", () => {
    it("posts multipart to /files, reports progress and returns the stored file", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const onProgress = vi.fn();
      const promise = uploadFile(recording(), { onProgress });
      const xhr = FakeXhr.last;
      expect(xhr.method).toBe("POST");
      expect(xhr.url).toBe("cc-api://backend/files");
      expect((xhr.body as FormData).get("file")).toBeInstanceOf(File);
      xhr.progress(1, 4);
      expect(onProgress).toHaveBeenCalledWith(0.25);
      xhr.finish(201, storedFile);
      await expect(promise).resolves.toEqual(storedFile);
    });

    it("maps 413 to FileTooLargeError with the limit from the server message", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadFile(recording());
      FakeXhr.last.finish(413, {
        code: "FILE_TOO_LARGE",
        message: "File is larger than 52428800 bytes",
      });
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FileTooLargeError);
      expect((error as FileTooLargeError).maxBytes).toBe(52_428_800);
      expect((error as Error).message).toBe("Файл больше 50 МБ");
    });

    it("keeps maxBytes null when the 413 message has no limit", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadFile(recording());
      FakeXhr.last.finish(413, { message: "Payload too large" });
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(FileTooLargeError);
      expect((error as FileTooLargeError).maxBytes).toBeNull();
      expect((error as Error).message).toBe("Файл больше допустимого размера");
    });

    it("formats a gigabyte limit", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadFile(recording());
      FakeXhr.last.finish(413, { message: "File is larger than 1073741824 bytes" });
      await expect(promise).rejects.toThrow("Файл больше 1 ГБ");
    });

    it("maps 415 to UnsupportedFileTypeError", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadFile(recording());
      FakeXhr.last.finish(415, {
        code: "FILE_UNSUPPORTED_MEDIA_TYPE",
        message: "Unsupported media type",
      });
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnsupportedFileTypeError);
      expect((error as Error).message).toBe("Этот тип файла не поддерживается");
    });

    it("maps other failures to BackendError with the server message", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const promise = uploadFile(recording());
      FakeXhr.last.finish(400, { message: "File is empty" });
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BackendError);
      expect((error as Error).message).toBe("File is empty");
    });

    it("rejects with AbortError when cancelled", async () => {
      vi.stubGlobal("XMLHttpRequest", FakeXhr);
      const controller = new AbortController();
      const promise = uploadFile(recording(), { signal: controller.signal });
      controller.abort();
      await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    });
  });

  describe("createDownloadLink", () => {
    it("posts to the download-link route and returns an absolute cc-api URL", async () => {
      const fn = stubFetch(
        json({
          url: `/files/${ID}/content?token=abc.def`,
          expiresAt: "2026-11-12T10:05:00.000Z",
        }),
      );
      const link = await createDownloadLink(ID);
      expect(fn.mock.calls[0][0]).toBe(`cc-api://backend/files/${ID}/download-link`);
      expect(fn.mock.calls[0][1]?.method).toBe("POST");
      expect(link).toEqual({
        url: `cc-api://backend/files/${ID}/content?token=abc.def`,
        expiresAt: "2026-11-12T10:05:00.000Z",
      });
    });

    it("encodes the file id in the path", async () => {
      const fn = stubFetch(json({ url: "/files/a/content?token=t", expiresAt: "x" }));
      await createDownloadLink("a/b");
      expect(fn.mock.calls[0][0]).toBe("cc-api://backend/files/a%2Fb/download-link");
    });

    it.each([
      [404, FileNotFoundError],
      [410, FileGoneError],
      [503, BackendError],
    ])("maps status %i", async (status, errorClass) => {
      stubFetch(json({ message: "nope" }, status));
      await expect(createDownloadLink(ID)).rejects.toBeInstanceOf(errorClass);
    });

    it("rejects a link body in an unexpected format", async () => {
      stubFetch(json({ href: "x" }));
      await expect(createDownloadLink(ID)).rejects.toBeInstanceOf(BackendError);
    });

    it("does not send the X-Client-App header", async () => {
      const fn = stubFetch(json({ url: "/files/a/content?token=t", expiresAt: "x" }));
      await createDownloadLink(ID);
      expect(new Headers(fn.mock.calls[0][1]?.headers).has("X-Client-App")).toBe(false);
    });
  });
});
