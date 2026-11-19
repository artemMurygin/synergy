import type { ComponentProps } from 'react'
import { Bell } from '../icons'
import { cn } from '../lib/cn'
import { formatBadgeCount } from './format-badge-count'

export type NotificationsButtonProps = Omit<ComponentProps<'button'>, 'children'> & {
  count: number
  /** Список открыт: кнопка подсвечена. */
  open?: boolean
}

/** Колокольчик со счётчиком непрочитанных (макет tx6uv): 0 скрывает бейдж, больше 99 — «99+». */
export function NotificationsButton({ count, open, className, type = 'button', ...props }: NotificationsButtonProps) {
  const text = formatBadgeCount(count)
  return (
    <button
      type={type}
      aria-label={text ? `Уведомления, непрочитанных: ${text}` : 'Уведомления'}
      aria-expanded={open ?? undefined}
      aria-haspopup="dialog"
      className={cn(
        'relative flex size-10 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
        open ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-alt text-ink-80 hover:bg-border',
        className,
      )}
      {...props}
    >
      <Bell />
      {text ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-pill bg-brand-red px-[5px] py-px text-center text-[10px] leading-3 font-bold text-surface"
        >
          {text}
        </span>
      ) : null}
    </button>
  )
}
