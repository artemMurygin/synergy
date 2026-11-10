import type {
  AuthActionResult,
  AuthFailureCode,
  SessionSnapshotView
} from '../../../../preload/auth-bridge'

export type AuthErrorCode = AuthFailureCode | 'PASSWORD_MISMATCH' | 'PASSWORD_UNCHANGED'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly retryAfterSec?: number

  constructor(code: AuthErrorCode, retryAfterSec?: number) {
    super(code)
    this.name = 'AuthError'
    this.code = code
    this.retryAfterSec = retryAfterSec
  }
}

function unwrap(result: AuthActionResult): SessionSnapshotView {
  if (result.ok) return result.snapshot
  throw new AuthError(result.code, result.retryAfterSec)
}

export async function login(loginName: string, password: string): Promise<SessionSnapshotView> {
  return unwrap(await window.api.auth.login(loginName, password))
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<SessionSnapshotView> {
  return unwrap(await window.api.auth.changePassword(currentPassword, newPassword))
}

export function logout(): Promise<{ serverRevoked: boolean }> {
  return window.api.auth.logout()
}

export function retryRestore(): Promise<void> {
  return window.api.auth.retryRestore()
}

export function getSessionState(): Promise<SessionSnapshotView> {
  return window.api.auth.getState()
}

export function subscribeToSession(listener: (snapshot: SessionSnapshotView) => void): () => void {
  return window.api.auth.onSessionChanged(listener)
}
