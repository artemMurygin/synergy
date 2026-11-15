import type { Role } from '@/lib/schemas'

/** Roles are never shown by their code: the portal speaks Russian. */
export const ROLE_LABEL: Record<Role, string> = { admin: 'Администратор', developer: 'Разработчик' }

/** Canonical order of roles: developer first, as in the forms. */
export const ROLE_ORDER: readonly Role[] = ['developer', 'admin']
