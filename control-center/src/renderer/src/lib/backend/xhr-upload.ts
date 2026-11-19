import type { z } from "zod";
import { BACKEND_ORIGIN } from "./client";
import { BackendError } from "./errors";
import { parseBody } from "./parse";

export interface UploadOptions {
  /** Fraction 0..1; called only when the total size is known. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface XhrUploadRequest<T> {
  file: File;
  /** Validates the success body. */
  schema: z.ZodType<T>;
  /** Maps an error response to a typed error of the calling API. */
  failure: (response: Response) => Promise<BackendError>;
  options?: UploadOptions;
}

const FILE_FIELD = "file";

function abortError(): DOMException {
  return new DOMException("Загрузка отменена", "AbortError");
}

/**
 * Posts one file as multipart field `file` to a backend path.
 * XHR instead of fetch: fetch cannot report upload progress.
 */
export function xhrUpload<T>(
  path: string,
  { file, schema, failure, options = {} }: XhrUploadRequest<T>,
): Promise<T> {
  const { onProgress, signal } = options;
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = (): void => { xhr.abort(); };
    const cleanup = (): void => signal?.removeEventListener("abort", onAbort);

    xhr.open("POST", `${BACKEND_ORIGIN}${path}`);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      cleanup();
      const response = new Response(xhr.responseText, { status: xhr.status });
      if (xhr.status >= 200 && xhr.status < 300) {
        parseBody(response, schema).then(resolve, reject);
      } else {
        failure(response).then(reject, reject);
      }
    });
    xhr.addEventListener("error", () => {
      cleanup();
      reject(new BackendError("Не удалось связаться с сервером. Он запущен?"));
    });
    xhr.addEventListener("abort", () => {
      cleanup();
      reject(abortError());
    });
    signal?.addEventListener("abort", onAbort);

    const form = new FormData();
    form.append(FILE_FIELD, file);
    xhr.send(form);
  });
}
