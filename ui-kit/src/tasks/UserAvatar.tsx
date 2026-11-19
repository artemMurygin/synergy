import { cn } from '../lib/cn'

export function initialsOf(login: string | null): string {
  const trimmed = login?.trim() ?? ''
  return trimmed === '' ? '—' : trimmed.slice(0, 2).toUpperCase()
}

/** Декоративный: логин всегда рядом текстом. */
export function UserAvatar({ login, size = 'md', className }: { login: string | null; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-sunken leading-none font-semibold text-ink-80 select-none',
        size === 'sm' ? 'size-6 text-[10px]' : 'size-[26px] text-[11px]',
        className,
      )}
    >
      {initialsOf(login)}
    </span>
  )
}
