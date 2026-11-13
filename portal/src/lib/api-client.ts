import type { z } from 'zod'
import { toApiError, unavailableError, unexpectedResponseError } from './errors'

export interface ApiClientOptions {
  baseUrl: string
  getAccessToken: () => string | null
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  /** Validates the JSON body of the answer; without it the answer body is ignored. */
  schema?: z.ZodType<T>
}

export function createApiClient({ baseUrl, getAccessToken }: ApiClientOptions) {
  const base = baseUrl.replace(/\/+$/, '')

  async function request<T = undefined>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    const { method = 'GET', body, query, schema } = options
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.set(key, String(value))
    }
    const qs = params.toString()
    const headers = new Headers()
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (body !== undefined) headers.set('Content-Type', 'application/json')

    let response: Response
    try {
      response = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch {
      throw unavailableError()
    }
    if (!response.ok) throw await toApiError(response)
    if (!schema) return undefined as T
    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw unexpectedResponseError()
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw unexpectedResponseError()
    return parsed.data
  }

  return { request }
}

export type ApiClient = ReturnType<typeof createApiClient>

let accessTokenProvider: () => string | null = () => null

/** The auth feature registers where the in-memory access token lives. */
export function setAccessTokenProvider(provider: () => string | null): void {
  accessTokenProvider = provider
}

/** The portal-wide client; the address comes from VITE_API_URL. */
export const apiClient: ApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  getAccessToken: () => accessTokenProvider()
})
