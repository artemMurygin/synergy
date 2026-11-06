import { HttpAgent } from '@ag-ui/client'
import { AskError, errorMessage } from './api'
import { getBackendUrl } from './settings'

/** The thread already has an active run (HTTP 409). */
export class RunConflictError extends AskError {}

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
