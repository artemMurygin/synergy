import { cn } from '../lib/cn'
import { NavBadge, type NavProps } from './NavRail'

/** Плавающий таб-бар раздела для режима mobile (макет CEpvB). */
export function TabBar({ items, active, onSelect }: Omit<NavProps, 'footer'>) {
  return (
    <nav
      data-slot="tab-bar"
      aria-label="Разделы"
      className="fixed inset-x-6 bottom-2 z-40 mx-auto flex h-16 max-w-[352px] gap-1 rounded-[32px] bg-surface p-[5px] shadow-panel"
    >
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
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-[27px] outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
              isActive ? 'bg-brand-red-soft text-brand-red' : 'text-ink-60',
            )}
          >
            <span className="relative">
              {item.icon}
              <NavBadge count={item.badge} />
            </span>
            <span className={cn('text-[10px] leading-3', isActive ? 'font-bold' : 'font-semibold')}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
