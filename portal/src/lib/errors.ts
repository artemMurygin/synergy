export type ApiErrorKind =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'unexpected'

const KIND_BY_STATUS: Record<number, ApiErrorKind> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict'
}

/** The single error type of every portal API call; `kind` tells the UI which text to show. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status; null when no response arrived (server unavailable). */
  readonly status: number | null
  /** The `code` field of the error body, null when absent. */
  readonly code: string | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

export function unavailableError(): ApiError {
  return new ApiError('unavailable', 'Сервер недоступен. Проверьте соединение и повторите попытку.')
}

export function unexpectedResponseError(): ApiError {
  return new ApiError('unexpected', 'Сервер вернул ответ в неожиданном формате')
}

/** Converts a non-2xx response into an ApiError. */
export async function toApiError(response: Response): Promise<ApiError> {
  let message = `Сервер ответил ошибкой ${String(response.status)}`
  let code: string | null = null
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const raw = (body as { message?: unknown }).message
      if (typeof raw === 'string') message = raw
      else if (Array.isArray(raw) && raw.every((m) => typeof m === 'string')) message = raw.join('; ')
      const rawCode = (body as { code?: unknown }).code
      if (typeof rawCode === 'string') code = rawCode
    }
  } catch {
    // the body is not JSON; the status line stays
  }
  return new ApiError(KIND_BY_STATUS[response.status] ?? 'unexpected', message, response.status, code)
}
