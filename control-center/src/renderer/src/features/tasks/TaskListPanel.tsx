import { TaskList } from '@synergy/ui-kit'
import { ChevronLeft, ChevronRight } from '@synergy/ui-kit/icons'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { tasksQuery, useUpdateTask } from '@/lib/backend/tasks.queries'
import { useTasksStore } from '@/stores/tasks.store'
import { useTaskFilters } from './use-task-filters'

/** "1–20 из 128" for a 1-based page. */
export function pageRange(page: number, limit: number, total: number): string {
  const from = Math.min((page - 1) * limit + 1, total)
  const to = Math.min(page * limit, total)
  return `${String(from)}–${String(to)} из ${String(total)}`
}

const PAGER_BUTTON =
  'flex size-9 items-center justify-center rounded-full text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-40 disabled:hover:bg-transparent'

interface TaskListPanelProps {
  onCreateTask: () => void
}

/** The list of tasks of the package fed by the tasks query, with the pager under it. */
export function TaskListPanel({ onCreateTask }: TaskListPanelProps) {
  const view = useTasksStore((s) => s.view)
  const search = useTasksStore((s) => s.search)
  const page = useTasksStore((s) => s.page)
  const selectedTaskId = useTasksStore((s) => s.selectedTaskId)
  const selectTask = useTasksStore((s) => s.selectTask)
  const setPage = useTasksStore((s) => s.setPage)

  const query = useQuery(tasksQuery(useTaskFilters()))
  const update = useUpdateTask()

  const data = query.data
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  // the current page emptied (last task deleted or gone): step back to the last page that exists
  const stranded = data !== undefined && data.items.length === 0 && data.total > 0 && page > pages
  useEffect(() => {
    if (stranded) setPage(pages)
  }, [stranded, pages, setPage])

  let error: string | null = null
  if (query.isError) {
    error = data
      ? 'Не удалось обновить список. Показаны ранее загруженные задачи.'
      : 'Не удалось связаться с сервером. Он запущен?'
  } else if (update.isError) {
    error = 'Не удалось изменить статус задачи. Изменение отменено.'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <TaskList
          variant="wide"
          items={data?.items ?? []}
          loading={query.isPending || stranded}
          refreshing={query.isFetching && data !== undefined}
          error={error}
          hasMore={false}
          remaining={0}
          selectedId={selectedTaskId}
          view={view}
          searching={search.trim() !== ''}
          onOpen={selectTask}
          onSetStatus={(id, status) => {
            update.mutate({ id, patch: { status } })
          }}
          onLoadMore={() => undefined}
          onRetry={() => {
            void query.refetch()
          }}
          onCreate={onCreateTask}
        />
      </div>
      {data && data.items.length > 0 && (
        <footer className="flex h-15 shrink-0 items-center gap-2 pr-4 pl-[22px] text-[13px] text-ink-60">
          <span className="flex-1">{pageRange(page, data.limit, data.total)}</span>
          <div className="flex h-10 items-center gap-0.5 rounded-full bg-surface-alt px-0.5">
            <button
              type="button"
              aria-label="Предыдущая страница"
              disabled={page <= 1}
              className={PAGER_BUTTON}
              onClick={() => {
                setPage(page - 1)
              }}
            >
              <ChevronLeft />
            </button>
            <span className="px-1.5 text-[13px] font-medium text-ink-80">{`${String(page)} / ${String(pages)}`}</span>
            <button
              type="button"
              aria-label="Следующая страница"
              disabled={page >= pages}
              className={PAGER_BUTTON}
              onClick={() => {
                setPage(page + 1)
              }}
            >
              <ChevronRight />
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}
