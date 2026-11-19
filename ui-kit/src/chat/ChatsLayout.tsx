import type { ReactNode } from 'react'
import { useLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'

export type ChatsLayoutProps = {
  list: ReactNode
  chat: ReactNode
  /** Список скрыт: чат занимает всё место (desktop/tablet). */
  listHidden?: boolean
  /** Какой экран показан в mobile. */
  mobileScreen?: 'list' | 'chat'
}

const PANEL = 'overflow-hidden rounded-[20px] bg-surface shadow-panel'

/** Раскладка экрана чатов (VHpuS, b4IMkD): две белые панели; в mobile один экран. */
export function ChatsLayout({ list, chat, listHidden = false, mobileScreen = 'chat' }: ChatsLayoutProps) {
  const mode = useLayoutMode()

  if (mode === 'mobile') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-surface text-ink">
        {mobileScreen === 'list' ? list : chat}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full gap-2.5 overflow-hidden text-ink">
      {!listHidden && (
        <aside
          aria-label="Список чатов"
          className={cn('h-full shrink-0', PANEL, mode === 'desktop' ? 'w-75' : 'w-62')}
        >
          {list}
        </aside>
      )}
      <main className={cn('flex h-full min-w-0 flex-1 flex-col', PANEL)}>{chat}</main>
    </div>
  )
}
