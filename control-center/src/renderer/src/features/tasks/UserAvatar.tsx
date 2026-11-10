import { cn } from '@/lib/utils'

interface UserAvatarProps {
  login: string | null
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASS = {
  sm: 'size-6 text-[11px]',
  md: 'size-7 text-sm'
} as const

/** First two letters of the login, upper-cased; "—" when there is no user. */
export function initialsOf(login: string | null): string {
  const trimmed = login?.trim() ?? ''
  return trimmed === '' ? '—' : trimmed.slice(0, 2).toUpperCase()
}

// Decorative: the login is always rendered next to the avatar
export function UserAvatar({ login, size = 'md', className }: UserAvatarProps) {
  return (
    <span
      aria-hidden
      data-slot="user-avatar"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-surface-sunken font-semibold leading-none text-ink',
        SIZE_CLASS[size],
        className
      )}
    >
      {initialsOf(login)}
    </span>
  )
}
