import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { tasksQuery } from '@/lib/backend/tasks.queries'
import { CreateTaskDialog } from './CreateTaskDialog'
import { TaskDrawer } from './TaskDrawer'
import { TaskList } from './TaskList'
import { TaskToolbar } from './TaskToolbar'
import { pluralTasks, useTaskFilters } from './use-task-filters'

export function TasksPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const onCreateTask = () => setCreateOpen(true)
  // same filters as the list, so this reads the list's cached query
  const total = useQuery(tasksQuery(useTaskFilters())).data?.total

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background">
      {/* the list narrows when the details panel opens beside it */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-8">
          <h1 className="font-display text-lg font-semibold">Задачи</h1>
          {total !== undefined && <span className="text-xs text-ink-60">{pluralTasks(total)}</span>}
          <div className="flex-1" />
          <Button
            type="button"
            className="h-10 gap-2 rounded-lg px-[18px] text-[15px] font-semibold shadow-[0_8px_4px_-4px_rgba(102,0,0,0.2)]"
            onClick={onCreateTask}
          >
            <Plus aria-hidden className="size-[18px]" />
            Новая задача
          </Button>
        </header>
        <div className="shrink-0 px-8 pt-4 pb-3">
          <TaskToolbar />
        </div>
        <TaskList onCreateTask={onCreateTask} />
      </div>
      <TaskDrawer />
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
