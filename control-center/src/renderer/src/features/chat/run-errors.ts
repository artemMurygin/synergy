/** HttpAgent reports a failed response as `HTTP <status>: <body>`. */
const CONFLICT = /\bHTTP 409\b/

/** The thread already has an active run. */
export function isRunConflict(error: string): boolean {
  return CONFLICT.test(error)
}

/** The server did not answer: the request failed, or the cc-api proxy answered 502. */
export function isUnreachable(error: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|Не удалось связаться|\bHTTP 502\b/i.test(
    error
  )
}

export const UNREACHABLE_MESSAGE = 'Не удалось связаться с сервером. Он запущен?'
