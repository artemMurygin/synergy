import { Button } from '@synergy/ui-kit'
import { Plus } from '@synergy/ui-kit/icons'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { tasksQuery } from '@/lib/backend/tasks.queries'
import { CreateTaskDialog } from './CreateTaskDialog'
import { TaskDetailsPanel } from './TaskDetailsPanel'
import { TaskFiltersContainer } from './TaskFiltersContainer'
import { TaskListPanel } from './TaskListPanel'
import { pluralTasks, useTaskFilters } from './use-task-filters'

/** The "Задачи" section: list with filters, details panel beside it, dialog of a new task (frame qryQB). */
export function TasksPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const onCreateTask = () => {
    setCreateOpen(true)
  }
  // same filters as the list, so this reads the list's cached query
  const total = useQuery(tasksQuery(useTaskFilters())).data?.total

  return (
    <div className="flex h-full min-h-0 gap-2.5 overflow-hidden">
      {/* the list narrows when the details panel opens beside it */}
      <section
        aria-label="Список задач"
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-surface shadow-panel"
      >
        <header className="flex h-16 shrink-0 items-center gap-2 px-3">
          <div className="flex h-11 items-center gap-2.5 rounded-[22px] bg-surface-alt px-[18px]">
            <h1 className="font-display text-base font-semibold text-ink">Задачи</h1>
            <span className="text-xs text-ink-60">{total === undefined ? 'Загрузка…' : pluralTasks(total)}</span>
          </div>
          <div className="flex-1" />
          <Button className="h-11 gap-2 rounded-[22px] px-5" onClick={onCreateTask}>
            <Plus />
            Новая задача
          </Button>
        </header>
        <TaskFiltersContainer />
        <TaskListPanel onCreateTask={onCreateTask} />
      </section>
      <TaskDetailsPanel />
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
