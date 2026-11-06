import { getBackendUrl } from './settings'

export interface ToolCallTrace {
  name: string
  args: unknown
}

export interface AskResponse {
  answer: string
  toolCalls: ToolCallTrace[]
  durationMs: number
}

export class AskError extends Error {}

/** The server does not know the chat session (HTTP 404). */
export class SessionNotFoundError extends AskError {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseToolCalls(value: unknown): ToolCallTrace[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) =>
    isRecord(item) && typeof item.name === 'string' ? [{ name: item.name, args: item.args }] : [],
  )
}

function parseResponse(body: unknown): AskResponse {
  if (!isRecord(body) || typeof body.answer !== 'string') {
    throw new AskError('Сервер вернул ответ в неожиданном формате')
  }
  return {
    answer: body.answer,
    toolCalls: parseToolCalls(body.toolCalls),
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : 0,
  }
}

export async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (isRecord(body) && typeof body.message === 'string') return body.message
  } catch {
    // the body is not JSON; fall back to the status line below
  }
  return `Сервер ответил ошибкой ${String(response.status)}`
}

export async function askAgent(
  question: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/sheets-qa/ask`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, sessionId }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.status === 404) throw new SessionNotFoundError(await errorMessage(response))
  if (!response.ok) throw new AskError(await errorMessage(response))
  return parseResponse(await response.json())
}

export async function checkBackend(url: string): Promise<string> {
  try {
    const response = await fetch(`${url}/health`)
    return response.ok ? 'Сервер доступен' : `Сервер ответил ошибкой ${String(response.status)}`
  } catch {
    return 'Не удалось подключиться'
  }
}
