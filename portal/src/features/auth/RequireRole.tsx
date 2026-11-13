import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router'
import type { Role } from '@/lib/schemas'
import { useSessionStore } from './model/session.store'
import { DEFAULT_PATH } from './RequireAuth'

/** Hides a section from users without the role; the section is never mounted, so it requests no data. */
export function RequireRole({ role, children }: { role: Role; children?: ReactNode }) {
  const status = useSessionStore((s) => s.status)
  const roles = useSessionStore((s) => s.profile?.roles)
  if (status !== 'signedIn') return null
  if (!roles?.includes(role)) return <Navigate to={DEFAULT_PATH} replace />
  return children ?? <Outlet />
}
