import { HttpAgent } from '@ag-ui/client'
import { withFileIds } from '@synergy/ui-kit'
import { catchError, throwError } from 'rxjs'
import { AskError, errorMessage } from './api'
import { authFetch } from './auth/auth-fetch'
import { withClientApp } from './client-app'
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

/** The server did not answer (the browser could not reach it at all). */
const UNREACHABLE = /failed to fetch|networkerror|load failed|network request failed/i

export const UNREACHABLE_MESSAGE =
  'Не удалось связаться с сервером. Проверьте адрес бэкенда в настройках расширения.'

/** Turns a transport failure of a run into the text the chat shows. */
export function normalizeRunError(error: unknown): unknown {
  if (isRunConflict(error)) return new RunConflictError(RUN_CONFLICT_MESSAGE)
  if (error instanceof Error && UNREACHABLE.test(error.message)) {
    return new AskError(UNREACHABLE_MESSAGE)
  }
  return error
}

/** AG-UI agent bound to a chat: `threadId` is the chat id on every level. */
export async function createAgent(threadId: string): Promise<HttpAgent> {
  const baseUrl = await getBackendUrl()
  const agent = withFileIds(
    new HttpAgent({
      url: `${baseUrl}/agent`,
      threadId,
      fetch: (url, init) => authFetch(url, withClientApp(init)),
    }),
  )
  const run = agent.run.bind(agent)
  agent.run = (input) =>
    run(input).pipe(catchError((error: unknown) => throwError(() => normalizeRunError(error))))
  return agent
}

/** Idempotent: 204 and 404 (no such run or thread) are not errors. */
export async function cancelRun(threadId: string): Promise<void> {
  const baseUrl = await getBackendUrl()
  let response: Response
  try {
    response = await authFetch(
      `${baseUrl}/threads/${encodeURIComponent(threadId)}/run/cancel`,
      withClientApp({ method: 'POST' }),
    )
  } catch {
    throw new AskError(`Не удалось связаться с сервером ${baseUrl}. Он запущен?`)
  }
  if (response.ok || response.status === 404) return
  throw new AskError(await errorMessage(response))
}
