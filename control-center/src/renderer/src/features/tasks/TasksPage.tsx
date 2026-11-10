import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreateTaskDialog } from './CreateTaskDialog'
import { TaskDrawer } from './TaskDrawer'
import { TaskList } from './TaskList'
import { TaskToolbar } from './TaskToolbar'

export function TasksPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const onCreateTask = () => setCreateOpen(true)

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b px-6">
        <h1 className="flex-1 text-lg font-semibold">Задачи</h1>
        <Button type="button" className="h-9 gap-1.5 rounded-xl px-3.5" onClick={onCreateTask}>
          <Plus aria-hidden className="size-4" />
          Новая задача
        </Button>
      </header>
      <div className="shrink-0 border-b px-6 py-3">
        <TaskToolbar />
      </div>
      <TaskList onCreateTask={onCreateTask} />
      <TaskDrawer />
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
