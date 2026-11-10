import { useState, type ReactNode } from 'react'
import { useUiStore } from '@/stores/ui.store'

interface AppShellProps {
  rail: ReactNode
  chats: ReactNode
  tasks: ReactNode
}

// Rail + active section. Once opened, a section stays mounted (hidden) to keep its state;
// the tasks section is not mounted before the first visit.
export function AppShell({ rail, chats, tasks }: AppShellProps) {
  const section = useUiStore((s) => s.section)
  const [tasksOpened, setTasksOpened] = useState(section === 'tasks')
  if (section === 'tasks' && !tasksOpened) setTasksOpened(true)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {rail}
      <section aria-label="Чаты" hidden={section !== 'chats'} className="h-full min-w-0 flex-1">
        {chats}
      </section>
      {tasksOpened ? (
        <section aria-label="Задачи" hidden={section !== 'tasks'} className="h-full min-w-0 flex-1">
          {tasks}
        </section>
      ) : null}
    </div>
  )
}
