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

  const mobile = mode === 'mobile'
  // One tree for every mode: the chat stays mounted (the draft, uploads, refs survive a change of
  // the mode and a trip to the list); on mobile the inactive screen is hidden, not unmounted.
  return (
    <div
      className={cn(
        'flex h-full w-full overflow-hidden text-ink',
        mobile ? 'flex-col bg-surface' : 'gap-2.5',
      )}
    >
      {mobile ? (
        mobileScreen === 'list' ? (
          list
        ) : null
      ) : (
        !listHidden && (
          <aside
            aria-label="Список чатов"
            className={cn('h-full shrink-0', PANEL, mode === 'desktop' ? 'w-75' : 'w-62')}
          >
            {list}
          </aside>
        )
      )}
      <main
        hidden={mobile && mobileScreen === 'list'}
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          mobile ? 'min-h-0 overflow-hidden' : cn('h-full', PANEL),
          mobile && mobileScreen === 'list' && 'hidden',
        )}
      >
        {chat}
      </main>
    </div>
  )
}
