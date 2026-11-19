import { AppFrame } from '@synergy/ui-kit'
import { useState, type ReactNode } from 'react'
import { NotificationsStream } from '@/features/notifications/NotificationsStream'
import { NotificationToaster } from '@/features/notifications/NotificationToaster'
import { useUiStore } from '@/stores/ui.store'
import { NavRailFooter, useNavSections } from './NavRail'

interface AppShellProps {
  chats: ReactNode
  tasks: ReactNode
}

// AppFrame of the package + the active section. Once opened, a section stays mounted (hidden)
// to keep its state; the tasks section is not mounted before the first visit.
export function AppShell({ chats, tasks }: AppShellProps) {
  const section = useUiStore((s) => s.section)
  const nav = useNavSections()
  const [tasksOpened, setTasksOpened] = useState(section === 'tasks')
  if (section === 'tasks' && !tasksOpened) setTasksOpened(true)

  return (
    <div className="h-screen w-screen overflow-hidden">
      <AppFrame
        nav={<NavRailFooter />}
        sections={nav.items}
        activeSection={nav.active}
        onSectionChange={nav.select}
        body={
          <>
            <section aria-label="Чаты" hidden={section !== 'chats'} className="h-full min-w-0 flex-1">
              {chats}
            </section>
            {tasksOpened ? (
              <section aria-label="Задачи" hidden={section !== 'tasks'} className="h-full min-w-0 flex-1">
                {tasks}
              </section>
            ) : null}
          </>
        }
      />
      <NotificationsStream />
      <NotificationToaster />
    </div>
  )
}
