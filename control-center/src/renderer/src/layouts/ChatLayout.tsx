import type { ReactNode } from 'react'

interface ChatLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  sidebarFooter?: ReactNode
}

// Two columns: fixed 320px chat list and a flexible thread area
export function ChatLayout({ sidebar, main, sidebarFooter }: ChatLayoutProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <aside className="flex h-full w-80 shrink-0 flex-col">
        <div className="min-h-0 flex-1">{sidebar}</div>
        {sidebarFooter}
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col">{main}</main>
    </div>
  )
}
