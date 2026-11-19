import { errorCode, errorMessage, fetchBackend } from "./client";
import {
  AttachmentLimitError,
  AttachmentTooLargeError,
  BackendError,
  TaskNotFoundError,
  TaskUserNotFoundError,
} from "./errors";
import { parseBody } from "./parse";
import { xhrUpload, type UploadOptions } from "./xhr-upload";
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
  /** 1-based, as shown in the UI; the backend counts pages from 0. */
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
  const { page, ...rest } = filters;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries<string | number | boolean | undefined>(rest)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  if (page !== undefined) query.set("page", String(page - 1));
  const qs = query.toString();
  const result = await parseBody(
    await call(qs ? `/tasks?${qs}` : "/tasks"),
    TaskPageSchema,
  );
  return { ...result, page: result.page + 1 };
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

export type { UploadOptions } from "./xhr-upload";

export function uploadAttachment(
  taskId: string,
  file: File,
  options: UploadOptions = {},
): Promise<Attachment> {
  return xhrUpload(`${taskPath(taskId)}/attachments`, {
    file,
    schema: AttachmentSchema,
    failure,
    options,
  });
}
