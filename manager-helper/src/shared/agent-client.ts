import { HttpAgent } from '@ag-ui/client'
import { AskError, errorMessage } from './api'
import { getBackendUrl } from './settings'

/** The thread already has an active run (HTTP 409). */
export class RunConflictError extends AskError {}

export const RUN_CONFLICT_MESSAGE =
  'В этом чате агент ещё отвечает. Дождитесь ответа или остановите его.'

/** HttpAgent reports a failed response as `HTTP <status>: <body>`. */
const CONFLICT_MESSAGE = /\bHTTP 409\b/

/** The error (or its text) says that the thread already has an active run. */
export function isRunConflict(error: unknown): boolean {
  if (error instanceof RunConflictError) return true
  if (typeof error === 'string') return CONFLICT_MESSAGE.test(error)
  return error instanceof Error && CONFLICT_MESSAGE.test(error.message)
}

/** AG-UI agent bound to a chat: `threadId` is the chat id on every level. */
export async function createAgent(threadId: string): Promise<HttpAgent> {
  const baseUrl = await getBackendUrl()
  return new HttpAgent({ url: `${baseUrl}/agent`, threadId })
}

/** Idempotent: 204 and 404 (no such run or thread) are not errors. */
export async function cancelRun(threadId: string): Promise<void> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await fetch(`${baseUrl}/threads/${encodeURIComponent(threadId)}/run/cancel`, {
      method: 'POST',
    })
  } catch {
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.ok || response.status === 404) return
  throw new AskError(await errorMessage(response))
}
