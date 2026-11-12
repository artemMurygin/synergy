import { BACKEND_ORIGIN, errorMessage, fetchBackend } from "./client";
import {
  BackendError,
  FileGoneError,
  FileNotFoundError,
  FileTooLargeError,
  UnsupportedFileTypeError,
} from "./errors";
import {
  DownloadLinkSchema,
  StoredFileSchema,
  type DownloadLink,
  type StoredFile,
} from "./files.schema";
import { parseBody } from "./parse";
import { xhrUpload, type UploadOptions } from "./xhr-upload";

export type { UploadOptions } from "./xhr-upload";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** The backend names the limit only in its message: "File is larger than N bytes". */
function limitFrom(message: string): number | null {
  const match = /(\d+)\s*bytes/i.exec(message);
  return match ? Number(match[1]) : null;
}

function formatLimit(bytes: number): string {
  if (bytes >= GB && bytes % GB === 0) return `${String(bytes / GB)} ГБ`;
  return `${String(Math.round(bytes / MB))} МБ`;
}

function tooLarge(message: string): FileTooLargeError {
  const maxBytes = limitFrom(message);
  return new FileTooLargeError(
    maxBytes === null
      ? "Файл больше допустимого размера"
      : `Файл больше ${formatLimit(maxBytes)}`,
    maxBytes,
  );
}

/** Maps an error response to a typed error by status. */
async function failure(response: Response): Promise<BackendError> {
  const message = await errorMessage(response.clone());
  switch (response.status) {
    case 404:
      return new FileNotFoundError(message);
    case 410:
      return new FileGoneError("Срок хранения файла истёк");
    case 413:
      return tooLarge(message);
    case 415:
      return new UnsupportedFileTypeError("Этот тип файла не поддерживается");
    default:
      return new BackendError(message);
  }
}

const filePath = (id: string): string => `/files/${encodeURIComponent(id)}`;

/** Uploads one file to the user's storage, with progress and cancellation. */
export function uploadFile(
  file: File,
  options: UploadOptions = {},
): Promise<StoredFile> {
  return xhrUpload("/files", { file, schema: StoredFileSchema, failure, options });
}

/** A short-lived signed link; `url` is absolute and goes through the cc-api proxy. */
export async function createDownloadLink(id: string): Promise<DownloadLink> {
  const response = await fetchBackend(`${filePath(id)}/download-link`, {
    method: "POST",
  });
  if (!response.ok) throw await failure(response);
  const link = await parseBody(response, DownloadLinkSchema);
  return { ...link, url: `${BACKEND_ORIGIN}${link.url}` };
}

/** Downloads the content of a file through a fresh signed link. */
export async function downloadFile(id: string): Promise<Blob> {
  const link = await createDownloadLink(id);
  let response: Response;
  try {
    response = await fetch(link.url);
  } catch {
    throw new BackendError("Не удалось связаться с сервером. Он запущен?");
  }
  if (!response.ok) throw await failure(response);
  return response.blob();
}
