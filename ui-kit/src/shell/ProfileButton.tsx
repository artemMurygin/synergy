import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0], parts[1]] : [parts[0]]
  return letters
    .map((p) => p?.[0] ?? '')
    .join('')
    .toUpperCase()
}

export type ProfileButtonProps = Omit<ComponentProps<'button'>, 'children'> & { name: string }

/** Круглая кнопка с инициалами (40 px), открывает меню профиля. */
export function ProfileButton({ name, className, type = 'button', ...props }: ProfileButtonProps) {
  return (
    <button
      type={type}
      aria-label={`Профиль: ${name}`}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-sm font-semibold text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40',
        className,
      )}
      {...props}
    >
      {initialsOf(name)}
    </button>
  )
}
