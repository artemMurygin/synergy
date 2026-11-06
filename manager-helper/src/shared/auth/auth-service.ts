import { getAccessToken, setAccessToken } from './access-token-store'
import {
  UnauthorizedError,
  changePasswordRequest,
  loginRequest,
  logoutRequest,
  meRequest,
  type TokenResponse,
} from './auth-api'
import { authFetch } from './auth-fetch'
import { setAuthState, type AuthUser } from './auth-state'
import { refreshAccessToken } from './refresh-coordinator'
import { endSession } from './session-channel'

async function loadUser(token: string): Promise<AuthUser | null> {
  try {
    const { id, login } = await meRequest(token)
    return { id, login }
  } catch {
    return null
  }
}

async function applyTokens(tokens: TokenResponse): Promise<void> {
  setAccessToken(tokens.accessToken)
  const user = await loadUser(tokens.accessToken)
  setAuthState({
    status: tokens.mustChangePassword ? 'must-change-password' : 'authenticated',
    user,
    notice: null,
  })
}

let restoring: Promise<void> | null = null

/** Restores the session from the refresh cookie; an unreachable server means `offline`. */
export function restoreSession(): Promise<void> {
  restoring ??= (async () => {
    setAuthState({ status: 'restoring' })
    try {
      await applyTokens(await refreshAccessToken())
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthState({ status: 'anonymous', user: null })
      else setAuthState({ status: 'offline' })
    }
  })().finally(() => {
    restoring = null
  })
  return restoring
}

export async function login(loginName: string, password: string): Promise<void> {
  await applyTokens(await loginRequest(loginName, password))
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await applyTokens(await changePasswordRequest({ currentPassword, newPassword }, authFetch))
}

export async function logout(): Promise<void> {
  let reached = true
  try {
    if (getAccessToken() !== null) await logoutRequest(authFetch)
  } catch (error) {
    reached = error instanceof UnauthorizedError
  }
  endSession()
  setAuthState({ notice: reached ? null : 'logout-offline' })
}
