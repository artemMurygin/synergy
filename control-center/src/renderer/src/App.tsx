import { LayoutModeProvider } from '@synergy/ui-kit'
import { AuthGate } from '@/features/auth'
import { ChatList } from '@/features/chat-list'
import { ChatThread } from '@/features/chat'
import { TasksPage } from '@/features/tasks'
import { AppShell } from '@/layouts/AppShell'
import { ChatLayout } from '@/layouts/ChatLayout'

export default function App() {
  return (
    <LayoutModeProvider mode="desktop">
      <AuthGate>
        <AppShell chats={<ChatLayout sidebar={<ChatList />} main={<ChatThread />} />} tasks={<TasksPage />} />
      </AuthGate>
    </LayoutModeProvider>
  )
}
