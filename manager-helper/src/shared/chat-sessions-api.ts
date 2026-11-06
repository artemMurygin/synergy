import { AskError, errorMessage, isRecord, parseToolCalls, SessionNotFoundError } from './api'
import type { ToolCallTrace } from './api'
import { getBackendUrl } from './settings'

export { SessionNotFoundError }

export interface ChatSession {
  id: string
  title: string
  titleIsCustom: boolean
  createdAt: string
  lastActivityAt: string
}

export type StoredMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'agent'; text: string; toolCalls: ToolCallTrace[]; durationMs: number }

const UNEXPECTED = 'Сервер вернул ответ в неожиданном формате'

function parseSession(value: unknown): ChatSession {
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
  }
}

function parseMessage(value: unknown): StoredMessage {
  if (!isRecord(value) || typeof value.text !== 'string') throw new AskError(UNEXPECTED)
  const id = Number(value.id)
  if (!Number.isFinite(id)) throw new AskError(UNEXPECTED)
  if (value.role === 'user') return { id, role: 'user', text: value.text }
  if (value.role === 'agent') {
    return {
      id,
      role: 'agent',
      text: value.text,
      toolCalls: parseToolCalls(value.toolCalls),
      durationMs: typeof value.durationMs === 'number' ? value.durationMs : 0,
    }
  }
  throw new AskError(UNEXPECTED)
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, init)
  } catch {
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.status === 404) throw new SessionNotFoundError(await errorMessage(response))
  if (!response.ok) throw new AskError(await errorMessage(response))
  return response
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

async function readList<T>(response: Response, parse: (item: unknown) => T): Promise<T[]> {
  const body: unknown = await response.json()
  if (!Array.isArray(body)) throw new AskError(UNEXPECTED)
  return body.map((item: unknown) => parse(item))
}

export async function listSessions(): Promise<ChatSession[]> {
  return readList(await request('/chat-sessions'), parseSession)
}

export async function createSession(title?: string): Promise<ChatSession> {
  const response = await request(
    '/chat-sessions',
    jsonInit('POST', title === undefined ? {} : { title }),
  )
  return parseSession(await response.json())
}

export async function getMessages(sessionId: string): Promise<StoredMessage[]> {
  const response = await request(`/chat-sessions/${encodeURIComponent(sessionId)}/messages`)
  return readList(response, parseMessage)
}

export async function renameSession(sessionId: string, title: string): Promise<ChatSession> {
  const response = await request(
    `/chat-sessions/${encodeURIComponent(sessionId)}`,
    jsonInit('PATCH', { title }),
  )
  return parseSession(await response.json())
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/chat-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}
