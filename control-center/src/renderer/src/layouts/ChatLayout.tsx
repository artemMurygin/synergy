import type { ReactNode } from 'react'

interface ChatLayoutProps {
  sidebar: ReactNode
  main: ReactNode
}

// Two columns: fixed 320px chat list and a flexible thread area
export function ChatLayout({ sidebar, main }: ChatLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="h-full w-80 shrink-0">{sidebar}</aside>
      <main className="flex h-full min-w-0 flex-1 flex-col">{main}</main>
    </div>
  )
}
