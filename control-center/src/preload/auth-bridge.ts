export type SessionStateName =
  | 'restoring'
  | 'authenticated'
  | 'mustChangePassword'
  | 'unauthenticated'
  | 'connectionError'

export type AuthFailureCode =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_RACE'
  | 'WRONG_PASSWORD'
  | 'SAME_PASSWORD'
  | 'WEAK_PASSWORD'
  | 'NETWORK'
  | 'SERVER_ERROR'
  | 'INVALID_INPUT'

export interface SessionUserView {
  id: string
  login: string
}

export interface SessionSnapshotView {
  state: SessionStateName
  user: SessionUserView | null
  warning?: string
  retryAfterSec?: number
}

export type AuthActionResult =
  | { ok: true; snapshot: SessionSnapshotView }
  | { ok: false; code: AuthFailureCode; retryAfterSec?: number }

export interface AuthBridge {
  login(login: string, password: string): Promise<AuthActionResult>
  changePassword(currentPassword: string, newPassword: string): Promise<AuthActionResult>
  logout(): Promise<{ serverRevoked: boolean }>
  retryRestore(): Promise<void>
  getState(): Promise<SessionSnapshotView>
  onSessionChanged(listener: (snapshot: SessionSnapshotView) => void): () => void
}
