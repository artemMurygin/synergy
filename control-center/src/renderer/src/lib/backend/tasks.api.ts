import { errorCode, errorMessage, fetchBackend, BACKEND_ORIGIN } from "./client";
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  BackendError,
  TaskNotFoundError,
  TaskUserNotFoundError,
} from "./errors";
import { parseBody } from "./parse";
import {
  AttachmentSchema,
  TaskDetailsSchema,
  TaskPageSchema,
  TaskSchema,
  type Attachment,
  type Task,
  type TaskDetails,
  type TaskPage,
  type TaskStatus,
} from "./tasks.schema";

export interface TaskFilters {
  status?: TaskStatus;
  creatorId?: string;
  assigneeId?: string;
  watcherId?: string;
  overdue?: boolean;
  search?: string;
  sort?: "deadline" | "createdAt" | "updatedAt";
  order?: "asc" | "desc";
  limit?: number;
  page?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  deadline?: string | null;
  assigneeId?: string | null;
  watcherIds?: string[];
}

/** Only the fields to change; `null` clears the deadline or the assignee. */
export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};

const TASK_USER_NOT_FOUND = "TASK_USER_NOT_FOUND";
const TASK_ATTACHMENT_LIMIT = "TASK_ATTACHMENT_LIMIT";

/** Maps an error response to a typed error by status and error code. */
async function failure(response: Response): Promise<BackendError> {
  const message = await errorMessage(response.clone());
  if (response.status === 404) return new TaskNotFoundError(message);
  if (response.status === 413) return new AttachmentTooLargeError(message);
  if (response.status === 422) {
    const code = await errorCode(response);
    if (code === TASK_USER_NOT_FOUND) return new TaskUserNotFoundError(message);
    if (code === TASK_ATTACHMENT_LIMIT) return new AttachmentLimitError(message);
  }
  return new BackendError(message);
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetchBackend(path, init);
  if (response.ok) return response;
  throw await failure(response);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const taskPath = (id: string): string => `/tasks/${encodeURIComponent(id)}`;
const attachmentPath = (taskId: string, attachmentId: string): string =>
  `${taskPath(taskId)}/attachments/${encodeURIComponent(attachmentId)}`;

export async function listTasks(filters: TaskFilters): Promise<TaskPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return parseBody(await call(qs ? `/tasks?${qs}` : "/tasks"), TaskPageSchema);
}

export async function getTask(id: string): Promise<TaskDetails> {
  return parseBody(await call(taskPath(id)), TaskDetailsSchema);
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return parseBody(await call("/tasks", jsonInit("POST", input)), TaskSchema);
}

export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
): Promise<Task> {
  return parseBody(
    await call(taskPath(id), jsonInit("PATCH", patch)),
    TaskSchema,
  );
}

export async function deleteTask(id: string): Promise<void> {
  await call(taskPath(id), { method: "DELETE" });
}

export async function deleteAttachment(
  taskId: string,
  attachmentId: string,
): Promise<void> {
  await call(attachmentPath(taskId, attachmentId), { method: "DELETE" });
}

const DEFAULT_FILE_NAME = "attachment";

/** Prefers RFC 5987 `filename*`, then plain `filename`. */
function fileNameFrom(disposition: string | null): string {
  if (disposition === null) return DEFAULT_FILE_NAME;
  const extended = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // malformed escape; fall through to the plain name
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1].trim() : DEFAULT_FILE_NAME;
}

export async function downloadAttachment(
  taskId: string,
  attachmentId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await call(attachmentPath(taskId, attachmentId));
  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response.headers.get("content-disposition")),
  };
}

export interface UploadOptions {
  /** Fraction 0..1; called only when the total size is known. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("Загрузка отменена", "AbortError");
}

/** XHR instead of fetch: fetch cannot report upload progress. */
export function uploadAttachment(
  taskId: string,
  file: File,
  options: UploadOptions = {},
): Promise<Attachment> {
  const { onProgress, signal } = options;
  return new Promise<Attachment>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = (): void => xhr.abort();
    const cleanup = (): void => signal?.removeEventListener("abort", onAbort);

    xhr.open("POST", `${BACKEND_ORIGIN}${taskPath(taskId)}/attachments`);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      cleanup();
      const response = new Response(xhr.responseText, { status: xhr.status });
      if (xhr.status >= 200 && xhr.status < 300) {
        parseBody(response, AttachmentSchema).then(resolve, reject);
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
    form.append("file", file);
    xhr.send(form);
  });
}
