import { LayoutModeProvider, ToastProvider } from '@synergy/ui-kit'
import { AuthGate } from '@/features/auth'
import { ChatsScreen } from '@/features/chat'
import { TasksPage } from '@/features/tasks'
import { AppShell } from '@/layouts/AppShell'

export default function App() {
  return (
    <LayoutModeProvider mode="desktop">
      <ToastProvider>
        <AuthGate>
          <AppShell chats={<ChatsScreen />} tasks={<TasksPage />} />
        </AuthGate>
      </ToastProvider>
    </LayoutModeProvider>
  )
}
