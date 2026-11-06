import { clearAccessToken, setAccessToken } from './access-token-store'
import { RefreshRaceError, UnauthorizedError, refreshRequest, type TokenResponse } from './auth-api'
import { endSession } from './session-channel'

const LOCK_NAME = 'auth-refresh'

let inflight: Promise<TokenResponse> | null = null

async function refreshOnce(): Promise<TokenResponse> {
  try {
    return await refreshRequest()
  } catch (error) {
    if (error instanceof RefreshRaceError) return refreshRequest()
    throw error
  }
}

async function performRefresh(): Promise<TokenResponse> {
  try {
    const tokens = await refreshOnce()
    setAccessToken(tokens.accessToken)
    return tokens
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      clearAccessToken()
      endSession()
    }
    throw error
  }
}

function withLock(task: () => Promise<TokenResponse>): Promise<TokenResponse> {
  const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator
  return hasLocks ? navigator.locks.request(LOCK_NAME, task) : task()
}

/** Parallel callers share one request; contexts are serialized with Web Locks. */
export function refreshAccessToken(): Promise<TokenResponse> {
  inflight ??= withLock(performRefresh).finally(() => {
    inflight = null
  })
  return inflight
}
