import { AskError, errorMessage, isRecord } from './api'
import { authFetch } from './auth/auth-fetch'
import { postMultipart } from './files-api'
import type { UploadOptions } from './files-api'
import { getBackendUrl } from './settings'

/** The task (or its attachment) does not exist on the server (HTTP 404). */
export class TaskNotFoundError extends AskError {}
/** The assignee or a watcher does not exist or is inactive (422 TASK_USER_NOT_FOUND). */
export class TaskUserNotFoundError extends AskError {}
/** The attachment exceeds the size limit (HTTP 413). */
export class AttachmentTooLargeError extends AskError {}
/** The task already has the maximum number of attachments (422 TASK_ATTACHMENT_LIMIT). */
export class AttachmentLimitError extends AskError {}
/** The server cannot sign attachment links (503 TASK_ATTACHMENT_LINKS_UNAVAILABLE). */
export class AttachmentLinksUnavailableError extends AskError {}
/** Any other backend failure; the message comes from the server. */
export class BackendError extends AskError {}

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export interface TaskUser {
  id: string
  /** null when the user has been deactivated. */
  login: string | null
}

export interface UserSummary {
  id: string
  login: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  deadline: string | null
  creator: TaskUser
  assignee: TaskUser | null
  watchers: TaskUser[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  /** Number of files of the task; 0 when the server does not send it. */
  attachmentCount: number
}

export interface Attachment {
  id: string
  taskId: string
  originalName: string
  sizeBytes: number
  contentType: string
  uploadedBy: string
  createdAt: string
}

export interface TaskDetails extends Task {
  attachments: Attachment[]
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  page: number
}
export type TaskPage = Page<Task>
export type UserPage = Page<UserSummary>

export interface ListTasksParams {
  status?: TaskStatus
  creatorId?: string
  assigneeId?: string
  watcherId?: string
  overdue?: boolean
  search?: string
  sort?: 'deadline' | 'createdAt' | 'updatedAt'
  order?: 'asc' | 'desc'
  limit?: number
  page?: number
}

export interface CreateTaskInput {
  title: string
  description?: string
  deadline?: string | null
  assigneeId?: string | null
  watcherIds?: string[]
}

export type UpdateTaskInput = Partial<CreateTaskInput> & { status?: TaskStatus }

export interface AttachmentLink {
  /** Relative to the backend: `/tasks/:id/attachments/:attachmentId/content?token=…`. */
  url: string
  expiresAt: string
}

const UNEXPECTED = 'Сервер вернул ответ в неожиданном формате'

function bad(): never {
  throw new AskError(UNEXPECTED)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : bad()
}

function nullableStr(value: unknown): string | null {
  return value === null ? null : str(value)
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : bad()
}

function rec(value: unknown): Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value) ? value : bad()
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item: unknown) => item) : bad()
}

function parseTaskUser(value: unknown): TaskUser {
  const user = rec(value)
  return { id: str(user.id), login: nullableStr(user.login) }
}

function parseUserSummary(value: unknown): UserSummary {
  const user = rec(value)
  return { id: str(user.id), login: str(user.login) }
}

function parseStatus(value: unknown): TaskStatus {
  const found = TASK_STATUSES.find((status) => status === value)
  return found ?? bad()
}

function parseTask(value: unknown): Task {
  const task = rec(value)
  return {
    id: str(task.id),
    title: str(task.title),
    description: str(task.description),
    status: parseStatus(task.status),
    deadline: nullableStr(task.deadline),
    creator: parseTaskUser(task.creator),
    assignee: task.assignee === null ? null : parseTaskUser(task.assignee),
    watchers: list(task.watchers).map(parseTaskUser),
    createdAt: str(task.createdAt),
    updatedAt: str(task.updatedAt),
    completedAt: nullableStr(task.completedAt),
    attachmentCount: task.attachmentCount === undefined ? 0 : num(task.attachmentCount),
  }
}

function parseAttachment(value: unknown): Attachment {
  const attachment = rec(value)
  return {
    id: str(attachment.id),
    taskId: str(attachment.taskId),
    originalName: str(attachment.originalName),
    sizeBytes: num(attachment.sizeBytes),
    contentType: str(attachment.contentType),
    uploadedBy: str(attachment.uploadedBy),
    createdAt: str(attachment.createdAt),
  }
}

function parseTaskDetails(value: unknown): TaskDetails {
  const details = rec(value)
  return { ...parseTask(details), attachments: list(details.attachments).map(parseAttachment) }
}

function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): Page<T> {
  const page = rec(value)
  return {
    items: list(page.items).map(parseItem),
    total: num(page.total),
    limit: num(page.limit),
    page: num(page.page),
  }
}

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    return isRecord(body) && typeof body.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

async function toError(response: Response): Promise<AskError> {
  const code = await errorCode(response)
  const message = await errorMessage(response)
  if (response.status === 404) return new TaskNotFoundError(message)
  if (response.status === 503 && code === 'TASK_ATTACHMENT_LINKS_UNAVAILABLE') {
    return new AttachmentLinksUnavailableError('Скачивание вложений сейчас недоступно на сервере')
  }
  if (response.status === 413) return new AttachmentTooLargeError(message)
  if (response.status === 422) {
    if (code === 'TASK_USER_NOT_FOUND') return new TaskUserNotFoundError(message)
    if (code === 'TASK_ATTACHMENT_LIMIT') return new AttachmentLimitError(message)
  }
  return new BackendError(message)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(`${baseUrl}${path}`, init)
  } catch {
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (!response.ok) throw await toError(response)
  return response
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text === '' ? '' : `?${text}`
}

export async function listTasks(params: ListTasksParams): Promise<TaskPage> {
  const response = await request(`/tasks${query({ ...params })}`)
  return parsePage(await response.json(), parseTask)
}

export async function getTask(taskId: string): Promise<TaskDetails> {
  const response = await request(`/tasks/${encodeURIComponent(taskId)}`)
  return parseTaskDetails(await response.json())
}

// POST и PATCH отдают задачу без списка вложений (только attachmentCount), полную карточку даёт GET /tasks/:id.
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const response = await request('/tasks', jsonInit('POST', input))
  return parseTask(await response.json())
}

export async function updateTask(taskId: string, patch: UpdateTaskInput): Promise<Task> {
  const response = await request(`/tasks/${encodeURIComponent(taskId)}`, jsonInit('PATCH', patch))
  return parseTask(await response.json())
}

/** Signed one-time link to the file of the attachment; the browser downloads it without a bearer token. */
export async function taskAttachmentLink(
  taskId: string,
  attachmentId: string,
): Promise<AttachmentLink> {
  let response: Response
  try {
    response = await request(
      `/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/download-link`,
      { method: 'POST' },
    )
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      throw new TaskNotFoundError('Вложение не найдено: возможно, его удалили', { cause: error })
    }
    throw error
  }
  const link = rec(await response.json().catch(bad))
  const url = str(link.url)
  if (!url.startsWith('/')) bad()
  return { url, expiresAt: str(link.expiresAt) }
}

export async function deleteTask(taskId: string): Promise<void> {
  await request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' })
}

export async function deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
  await request(
    `/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { method: 'DELETE' },
  )
}

/** Attaches one file (multipart "file", XHR for the progress); the errors are the ones of `request`. */
export async function uploadAttachment(
  taskId: string,
  file: File,
  options: UploadOptions = {},
): Promise<Attachment> {
  const { status, body } = await postMultipart(
    `/tasks/${encodeURIComponent(taskId)}/attachments`,
    file,
    options,
  )
  if (status < 200 || status >= 300) {
    throw await toError(new Response(body, { status }))
  }
  try {
    return parseAttachment(JSON.parse(body))
  } catch {
    throw new AskError(UNEXPECTED)
  }
}

export async function searchUsers(search: string, limit?: number): Promise<UserPage> {
  const response = await request(`/users${query({ search: search.trim(), limit })}`)
  return parsePage(await response.json(), parseUserSummary)
}
