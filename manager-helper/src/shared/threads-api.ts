import type { Message } from '@ag-ui/client'
import { AskError, errorMessage, isRecord } from './api'
import { authFetch } from './auth/auth-fetch'
import { getBackendUrl } from './settings'

/** The server does not know the thread (HTTP 404). */
export class ThreadNotFoundError extends AskError {}

export interface Thread {
  id: string
  title: string
  titleIsCustom: boolean
  createdAt: string
  lastActivityAt: string
  /** An agent run is in progress in this thread. */
  running: boolean
}

export interface ThreadHistory {
  /** Thread history in AG-UI message format. */
  messages: Message[]
  running: boolean
}

const UNEXPECTED = 'Сервер вернул ответ в неожиданном формате'

function parseThread(value: unknown): Thread {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.lastActivityAt !== 'string'
  ) {
    throw new AskError(UNEXPECTED)
  }
  return {
    id: value.id,
    title: value.title,
    titleIsCustom: value.titleIsCustom === true,
    createdAt: value.createdAt,
    lastActivityAt: value.lastActivityAt,
    running: value.running === true,
  }
}

function isMessage(value: unknown): value is Message {
  // The server returns AG-UI messages; the runtime consumes them as is.
  return isRecord(value) && typeof value.id === 'string' && typeof value.role === 'string'
}

function parseMessage(value: unknown): Message {
  if (!isMessage(value)) throw new AskError(UNEXPECTED)
  return value
}

function parseHistory(value: unknown): ThreadHistory {
  if (!isRecord(value) || !Array.isArray(value.messages)) throw new AskError(UNEXPECTED)
  return {
    messages: value.messages.map((item: unknown) => parseMessage(item)),
    running: value.running === true,
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(`${baseUrl}${path}`, init)
  } catch {
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.status === 404) throw new ThreadNotFoundError(await errorMessage(response))
  if (!response.ok) throw new AskError(await errorMessage(response))
  return response
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export async function listThreads(): Promise<Thread[]> {
  const body: unknown = await (await request('/threads')).json()
  if (!Array.isArray(body)) throw new AskError(UNEXPECTED)
  return body.map((item: unknown) => parseThread(item))
}

export async function createThread(title?: string): Promise<Thread> {
  const response = await request('/threads', jsonInit('POST', title === undefined ? {} : { title }))
  return parseThread(await response.json())
}

export async function getThread(threadId: string): Promise<ThreadHistory> {
  const response = await request(`/threads/${encodeURIComponent(threadId)}/messages`)
  return parseHistory(await response.json())
}

export async function renameThread(threadId: string, title: string): Promise<Thread> {
  const response = await request(
    `/threads/${encodeURIComponent(threadId)}`,
    jsonInit('PATCH', { title }),
  )
  return parseThread(await response.json())
}

export async function deleteThread(threadId: string): Promise<void> {
  await request(`/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' })
}
