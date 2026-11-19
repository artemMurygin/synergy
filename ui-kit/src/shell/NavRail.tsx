import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { formatBadgeCount } from '../notifications/format-badge-count'

export type NavItem = {
  id: string
  label: string
  icon: ReactNode
  badge?: number
}

export type NavProps = {
  items: NavItem[]
  active: string
  onSelect: (id: string) => void
  footer?: ReactNode
}

export function NavBadge({ count }: { count?: number }) {
  const text = formatBadgeCount(count ?? 0)
  if (!text) return null
  return (
    <span className="absolute -top-1 -right-1 min-w-4 rounded-pill bg-brand-red px-[5px] py-px text-center text-[10px] leading-3 font-bold text-surface">
      {text}
    </span>
  )
}

/** Вертикальный рейл разделов для режимов desktop и tablet (макет IINg3). */
export function NavRail({ items, active, onSelect, footer }: NavProps) {
  return (
    <nav
      data-slot="nav-rail"
      aria-label="Разделы"
      className="flex w-[72px] shrink-0 flex-col items-center gap-2.5 rounded-xl bg-surface px-2 py-3.5 shadow-panel"
    >
      <div className="flex flex-col gap-1.5">
        {items.map((item) => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                onSelect(item.id)
              }}
              className="flex size-14 flex-col items-center justify-center gap-1 rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
            >
              <span
                className={cn(
                  'relative flex h-[30px] w-12 items-center justify-center rounded-[15px] transition-colors',
                  isActive ? 'text-brand-red' : 'text-ink-60 hover:bg-surface-alt',
                )}
              >
                {item.icon}
                <NavBadge count={item.badge} />
              </span>
              <span className={cn('text-[10px] leading-3', isActive ? 'font-bold text-brand-red' : 'font-semibold text-ink-60')}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex-1" />
      {footer ? <div className="flex flex-col items-center gap-2.5">{footer}</div> : null}
    </nav>
  )
}
