import { ListChecks, MessageSquare, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useSessionStore } from '@/features/auth/session.store'
import { cn } from '@/lib/utils'
import { useUiStore, type AppSection } from '@/stores/ui.store'

const ITEMS: { section: AppSection; label: string; icon: LucideIcon }[] = [
  { section: 'chats', label: 'Чаты', icon: MessageSquare },
  { section: 'tasks', label: 'Задачи', icon: ListChecks }
]

// Vertical rail: section switch, theme and the current user (frame A6WsC)
export function NavRail() {
  const section = useUiStore((s) => s.section)
  const setSection = useUiStore((s) => s.setSection)
  const dark = useUiStore((s) => s.dark)
  const toggleDark = useUiStore((s) => s.toggleDark)
  const login = useSessionStore((s) => s.snapshot.user?.login)

  return (
    <nav
      aria-label="Разделы"
      className="flex h-full w-16 shrink-0 flex-col items-center gap-2 border-r bg-surface-alt px-2 py-3"
    >
      {ITEMS.map(({ section: id, label, icon: Icon }) => {
        const active = section === id
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setSection(id)}
            className={cn(
              'flex h-[54px] w-12 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring',
              active && 'bg-brand-red-soft text-brand-red hover:bg-brand-red-soft'
            )}
          >
            <Icon aria-hidden className="size-5" />
            <span className="text-[10px] leading-3 font-semibold">{label}</span>
          </button>
        )
      })}
      <div className="flex-1" />
      <button
        type="button"
        aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
        onClick={toggleDark}
        className="flex size-9 items-center justify-center rounded-xl text-muted-foreground outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring"
      >
        {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
      </button>
      {login ? (
        <span
          title={login}
          aria-label={`Вы вошли как ${login}`}
          role="img"
          className="flex size-9 items-center justify-center rounded-full bg-brand-red-soft text-xs font-semibold text-brand-red"
        >
          {login.slice(0, 2).toUpperCase()}
        </span>
      ) : null}
    </nav>
  )
}
