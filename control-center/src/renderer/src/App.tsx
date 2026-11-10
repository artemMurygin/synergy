import { useEffect } from 'react'
import { AuthGate, SidebarFooter } from '@/features/auth'
import { ChatList } from '@/features/chat-list'
import { ChatThread } from '@/features/chat'
import { TasksPage } from '@/features/tasks'
import { AppShell } from '@/layouts/AppShell'
import { ChatLayout } from '@/layouts/ChatLayout'
import { NavRail } from '@/layouts/NavRail'
import { useUiStore } from '@/stores/ui.store'

export default function App() {
  const dark = useUiStore((state) => state.dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <AuthGate>
      <AppShell
        rail={<NavRail />}
        chats={<ChatLayout sidebar={<ChatList />} main={<ChatThread />} sidebarFooter={<SidebarFooter />} />}
        tasks={<TasksPage />}
      />
    </AuthGate>
  )
}
