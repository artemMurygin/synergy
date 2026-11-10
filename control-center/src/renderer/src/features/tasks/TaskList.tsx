import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CloudOff, ClipboardList, Plus } from 'lucide-react'
import { useSessionStore } from '@/features/auth/session.store'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { TaskFilters } from '@/lib/backend/tasks.api'
import { tasksQuery, useUpdateTask } from '@/lib/backend/tasks.queries'
import type { TaskStatus } from '@/lib/backend/tasks.schema'
import { useTasksStore } from '@/stores/tasks.store'
import { TASK_GRID, TaskRow } from './TaskRow'
import { viewToFilter } from './view-filter'

export const PAGE_SIZE = 20

interface TaskListProps {
  onCreateTask?: () => void
}

function Notice(props: { icon: React.ReactNode; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {props.icon}
      <h2 className="text-base font-semibold">{props.title}</h2>
      <p className="max-w-[320px] text-[13px] leading-snug text-muted-foreground">{props.text}</p>
      {props.children}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Загрузка задач" className="flex flex-col">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b px-4 py-3.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function TaskList({ onCreateTask }: TaskListProps) {
  const userId = useSessionStore((s) => s.snapshot.user?.id ?? '')
  const view = useTasksStore((s) => s.view)
  const status = useTasksStore((s) => s.status)
  const search = useTasksStore((s) => s.search)
  const sort = useTasksStore((s) => s.sort)
  const order = useTasksStore((s) => s.order)
  const page = useTasksStore((s) => s.page)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const setPage = useTasksStore((s) => s.setPage)
  const resetFilters = useTasksStore((s) => s.resetFilters)

  const trimmed = search.trim()
  const filters: TaskFilters = {
    ...viewToFilter(view, userId),
    ...(status ? { status } : {}),
    ...(trimmed ? { search: trimmed } : {}),
    sort,
    order,
    limit: PAGE_SIZE,
    page
  }
  const query = useQuery(tasksQuery(filters))
  const update = useUpdateTask()
  const hasFilters = view !== 'all' || status !== null || trimmed !== ''
  const changeStatus = (id: string, next: TaskStatus) => update.mutate({ id, patch: { status: next } })

  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  // the current page emptied (last task deleted or gone): step back to the last page that exists
  const stranded = data !== undefined && data.items.length === 0 && data.total > 0 && page > pages
  useEffect(() => {
    if (stranded) setPage(pages)
  }, [stranded, pages, setPage])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {query.isError && data && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b bg-brand-red-soft px-4 py-2 text-[13px] text-brand-red"
        >
          <span className="flex-1">Не удалось обновить список. Показаны ранее загруженные задачи.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      )}
      {update.isError && (
        <div role="alert" className="border-b bg-brand-red-soft px-4 py-2 text-[13px] text-brand-red">
          Не удалось изменить статус задачи. Изменение отменено.
        </div>
      )}

      {(query.isPending || stranded) && <ListSkeleton />}
      {query.isError && !data && (
        <Notice
          icon={<CloudOff aria-hidden className="size-9 text-primary" />}
          title="Не удалось загрузить задачи"
          text="Не удалось связаться с сервером. Он запущен?"
        >
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </Notice>
      )}
      {data && data.items.length === 0 && !stranded && (
        hasFilters ? (
          <Notice
            icon={<ClipboardList aria-hidden className="size-9 text-muted-foreground" />}
            title="Ничего не найдено"
            text="Под выбранные фильтры не подходит ни одна задача."
          >
            <Button type="button" variant="outline" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          </Notice>
        ) : (
          <Notice
            icon={<ClipboardList aria-hidden className="size-9 text-muted-foreground" />}
            title="Задач пока нет"
            text="Создайте первую задачу, чтобы назначить ответственного и срок."
          >
            <Button type="button" onClick={onCreateTask}>
              <Plus aria-hidden className="size-4" />
              Создать задачу
            </Button>
          </Notice>
        )
      )}
      {data && data.items.length > 0 && (
        <>
          <div
            aria-hidden
            className={`${TASK_GRID} border-b bg-surface-alt py-2 pr-4 pl-[60px] text-[11px] font-semibold tracking-wide text-ink-60 uppercase`}
          >
            <span>Название</span>
            <span>Ответственный</span>
            <span>Дедлайн</span>
            <span>Статус</span>
          </div>
          <ul aria-label="Задачи" className="min-h-0 flex-1 overflow-y-auto">
            {data.items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={task.id === selectedTaskId}
                onSelect={selectTask}
                onStatusChange={changeStatus}
              />
            ))}
          </ul>
          <footer className="flex h-12 shrink-0 items-center gap-2 border-t px-4 text-[13px] text-ink-60">
            <span className="flex-1">Всего: {data.total}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Предыдущая страница"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <span>
              Страница {page} из {pages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Следующая страница"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </footer>
        </>
      )}
    </div>
  )
}
