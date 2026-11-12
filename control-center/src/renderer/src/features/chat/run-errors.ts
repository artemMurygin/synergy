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

const GONE = /\bHTTP 410\b/

/** The run was refused because an attached file is deleted (FILE_GONE). */
export function isFileGone(error: string): boolean {
  return GONE.test(error)
}

/** The id of the expired file named in the refusal (`File <id> is deleted`), if any. */
export function goneFileId(error: string): string | null {
  return /File (\S+?) is deleted/.exec(error)?.[1] ?? null
}
