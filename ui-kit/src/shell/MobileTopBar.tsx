import type { ReactNode } from 'react'
import { ChevronLeft, Plus } from '../icons'

export type MobileTopBarProps = {
  title: string
  meta?: string
  /** Кнопка к списку; без неё не показывается. */
  onBack?: () => void
  onCreate: () => void
  notifications?: ReactNode
  profile?: ReactNode
}

/** Верхняя панель mobile (hTZ3b): к списку, название и время, красная «+», уведомления, аватар. */
export function MobileTopBar({ title, meta, onBack, onCreate, notifications, profile }: MobileTopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-3">
      {onBack && (
        <button
          type="button"
          aria-label="К списку чатов"
          onClick={onBack}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col pl-1">
        <h1 className="truncate font-display text-lg font-semibold leading-tight text-ink">{title}</h1>
        {meta ? <span className="truncate text-[11px] text-ink-60">{meta}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Новый чат"
        onClick={onCreate}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-red text-white outline-none hover:bg-brand-red-hover focus-visible:ring-2 focus-visible:ring-brand-red/40"
      >
        <Plus size={20} />
      </button>
      {notifications}
      {profile}
    </header>
  )
}
