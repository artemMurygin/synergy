import type { SessionState } from './session-state'

export interface SessionUser {
  id: string
  login: string
}

export interface SessionSnapshot {
  state: SessionState
  user: SessionUser | null
  warning?: string
  retryAfterSec?: number
}
