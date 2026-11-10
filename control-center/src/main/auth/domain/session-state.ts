export const SESSION_STATES = [
  'restoring',
  'authenticated',
  'mustChangePassword',
  'unauthenticated',
  'connectionError'
] as const

export type SessionState = (typeof SESSION_STATES)[number]

const ALLOWED_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  restoring: ['authenticated', 'mustChangePassword', 'unauthenticated', 'connectionError'],
  connectionError: ['restoring'],
  unauthenticated: ['authenticated', 'mustChangePassword'],
  authenticated: ['unauthenticated', 'mustChangePassword'],
  mustChangePassword: ['authenticated', 'unauthenticated']
}

export function canTransition(from: SessionState, to: SessionState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!canTransition(from, to)) throw new Error(`Invalid session transition: ${from} -> ${to}`)
}
