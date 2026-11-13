import type { Profile, Role } from '@/lib/schemas'
import { login, logout } from './auth.api'
import { useSessionStore, type SessionStatus } from './model/session.store'

export interface SessionView {
  status: SessionStatus
  profile: Profile | null
  roles: Role[]
  login: typeof login
  logout: typeof logout
}

const NO_ROLES: Role[] = []

export function useSession(): SessionView {
  const status = useSessionStore((s) => s.status)
  const profile = useSessionStore((s) => s.profile)
  return { status, profile, roles: profile?.roles ?? NO_ROLES, login, logout }
}
