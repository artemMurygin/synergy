import { getAccessToken } from './access-token-store'
import { isRecord } from '../api'
import { getAuthState, setAuthState } from './auth-state'
import { refreshAccessToken } from './refresh-coordinator'

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json()
    return isRecord(body) && typeof body.code === 'string' ? body.code : null
  } catch {
    return null
  }
}

function withBearer(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers)
  headers.set('authorization', `Bearer ${token}`)
  return { ...init, headers }
}

async function currentToken(): Promise<string> {
  return getAccessToken() ?? (await refreshAccessToken()).accessToken
}

async function trackPasswordChange(response: Response): Promise<Response> {
  if (response.status === 403 && (await errorCode(response)) === 'PASSWORD_CHANGE_REQUIRED') {
    if (getAuthState().status === 'authenticated') setAuthState({ status: 'must-change-password' })
  }
  return response
}

/** fetch with the bearer token; on an expired token refreshes once and repeats. */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const used = await currentToken()
  const response = await fetch(url, withBearer(init, used))

  if (response.status === 401) {
    const code = await errorCode(response)
    if (code !== 'TOKEN_EXPIRED' && code !== 'TOKEN_INVALID') return response
    // Another request may have renewed the token while this one was in flight.
    const renewed = getAccessToken()
    const fresh =
      renewed !== null && renewed !== used ? renewed : (await refreshAccessToken()).accessToken
    return trackPasswordChange(await fetch(url, withBearer(init, fresh)))
  }

  return trackPasswordChange(response)
}
