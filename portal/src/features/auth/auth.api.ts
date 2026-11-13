import { z } from 'zod'
import { apiClient, setAccessTokenProvider, type RequestOptions } from '@/lib/api-client'
import { ApiError } from '@/lib/errors'
import { profileSchema, type Profile } from '@/lib/schemas'
import { useSessionStore } from './model/session.store'
import { createRefreshCoordinator } from './refresh-coordinator'

export type AuthErrorCode = 'INVALID_CREDENTIALS' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'UNEXPECTED'

/** Login failure with a code the form maps to text: wrong data and an unreachable server differ. */
export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly cause: ApiError

  constructor(code: AuthErrorCode, cause: ApiError) {
    super(cause.message)
    this.name = 'AuthError'
    this.code = code
    this.cause = cause
  }
}

function toAuthError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error
  if (error.kind === 'unavailable') return new AuthError('UNAVAILABLE', error)
  if (error.kind === 'unauthorized') return new AuthError('INVALID_CREDENTIALS', error)
  if (error.status === 429) return new AuthError('RATE_LIMITED', error)
  return new AuthError('UNEXPECTED', error)
}

const tokensSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  mustChangePassword: z.boolean()
})

setAccessTokenProvider(() => useSessionStore.getState().accessToken)

export function fetchProfile(): Promise<Profile> {
  return apiClient.request('/auth/me', { schema: profileSchema })
}

async function refreshAccessToken(): Promise<void> {
  const tokens = await apiClient.request('/auth/refresh', { method: 'POST', schema: tokensSchema })
  useSessionStore.getState().setAccessToken(tokens.accessToken)
}

const coordinator = createRefreshCoordinator({
  refresh: refreshAccessToken,
  onSessionLost: () => useSessionStore.getState().signOut()
})

/** A request to the API that refreshes the session once when the access token has expired. */
export function authorizedRequest<T = undefined>(path: string, options?: RequestOptions<T>): Promise<T> {
  return coordinator.run(() => apiClient.request<T>(path, options))
}

export async function login(loginName: string, password: string): Promise<Profile> {
  let tokens: z.infer<typeof tokensSchema>
  try {
    tokens = await apiClient.request('/auth/login', {
      method: 'POST',
      body: { login: loginName, password },
      schema: tokensSchema
    })
  } catch (error) {
    throw toAuthError(error)
  }
  useSessionStore.getState().setAccessToken(tokens.accessToken)
  try {
    const profile = await fetchProfile()
    useSessionStore.getState().signIn(tokens.accessToken, profile)
    return profile
  } catch (error) {
    useSessionStore.getState().signOut()
    throw toAuthError(error)
  }
}

/** Restores the session by the refresh cookie; never throws, the result is the store status. */
export async function restoreSession(): Promise<void> {
  const store = useSessionStore.getState()
  store.setRestoring()
  try {
    await coordinator.refresh()
    const profile = await fetchProfile()
    useSessionStore.getState().signIn(useSessionStore.getState().accessToken ?? '', profile)
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'unauthorized') useSessionStore.getState().signOut()
    else useSessionStore.getState().markUnavailable()
  }
}

/** Revokes the session on the server; the token is cleared even if the server cannot be reached. */
export async function logout(): Promise<{ serverRevoked: boolean }> {
  let serverRevoked = true
  try {
    await apiClient.request('/auth/logout', { method: 'POST' })
  } catch {
    serverRevoked = false
  }
  useSessionStore.getState().signOut()
  return { serverRevoked }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<Profile> {
  const tokens = await authorizedRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
    schema: tokensSchema
  })
  useSessionStore.getState().setAccessToken(tokens.accessToken)
  const profile = await fetchProfile()
  useSessionStore.getState().setProfile(profile)
  return profile
}
