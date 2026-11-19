import type { ReactNode } from 'react'

interface ChatLayoutProps {
  /** The chat list; not rendered while it is hidden. */
  sidebar: ReactNode
  main: ReactNode
  /** The list is hidden: the chat takes its place. */
  collapsed?: boolean
}

// Two panels (frames VHpuS, b4IMkD): a 300px chat list and a flexible dialog area
export function ChatLayout({ sidebar, main, collapsed = false }: ChatLayoutProps) {
  return (
    <div className="flex h-full w-full gap-2.5 overflow-hidden text-ink">
      {!collapsed && (
        <aside aria-label="Список чатов" className="h-full w-75 shrink-0 overflow-hidden rounded-[20px] bg-surface shadow-panel">
          {sidebar}
        </aside>
      )}
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-surface shadow-panel">{main}</main>
    </div>
  )
}
