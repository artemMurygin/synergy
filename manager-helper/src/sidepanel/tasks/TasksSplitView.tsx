import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskStatus } from '@/shared/tasks-api'
import { isWidePanel } from '../panel-layout'
import { CloseIcon, PlusIcon, SettingsIcon } from '../icons'
import { useViewportSize } from '../use-viewport-size'
import { QuickCreate } from './QuickCreate'
import { TaskDetails } from './TaskDetails'
import { TaskList } from './TaskList'
import { TasksToolbar } from './TasksToolbar'
import { tasksPaneVisibility } from './tasks-layout'
import { useTasks } from './use-tasks'

const iconButton =
  'flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt'

/**
 * Tasks screen: one state for both layouts. A wide panel (>= 640 px) shows the list and the
 * details side by side, a narrow one shows either of them; the hidden pane stays mounted so
 * scroll position and the selection survive a width change.
 */
export function TasksSplitView({
  userId,
  login,
  switcher,
}: {
  userId: string
  login: string
  switcher: ReactNode
}) {
  const tasks = useTasks(userId)
  const { reload } = tasks
  const { widthPx } = useViewportSize()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Details are re-read after the list changed the selected task.
  const [detailsVersion, setDetailsVersion] = useState(0)
  const panes = tasksPaneVisibility(widthPx, selectedId)

  const setStatus = async (taskId: string, status: TaskStatus) => {
    await tasks.setStatus(taskId, status)
    if (taskId === selectedId) setDetailsVersion((version) => version + 1)
  }

  const missing = useCallback(
    (taskId: string) => {
      setSelectedId((current) => (current === taskId ? null : current))
      setMessage('Задача не найдена: возможно, её удалили')
      void reload()
    },
    [reload],
  )
  const changed = useCallback(() => {
    void reload()
  }, [reload])

  const notice = tasks.notice ?? message

  return (
    <section aria-label="Задачи" className="flex min-h-0 flex-1">
      <div
        hidden={!panes.list}
        className={`${panes.list ? 'flex' : 'hidden'} min-h-0 flex-col ${
          isWidePanel(widthPx) ? 'w-85 shrink-0 border-r border-line' : 'flex-1'
        }`}
      >
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          {switcher}
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Новая задача"
            aria-expanded={creating}
            className={`${iconButton} text-brand-red`}
            onClick={() => {
              setCreating((open) => !open)
            }}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            aria-label="Настройки"
            className={`${iconButton} text-ink-60`}
            onClick={() => void chrome.runtime.openOptionsPage()}
          >
            <SettingsIcon />
          </button>
        </header>
        <TasksToolbar
          view={tasks.view}
          search={tasks.search}
          onViewChange={tasks.setView}
          onSearchChange={tasks.setSearch}
        />
        {creating && (
          <QuickCreate
            me={{ id: userId, login }}
            onCreated={() => {
              setCreating(false)
              void reload()
            }}
            onCancel={() => {
              setCreating(false)
            }}
          />
        )}
        {notice !== null && (
          <div
            role="status"
            aria-label="Сообщение"
            className="flex items-start gap-2 border-b border-line bg-brand-red-soft px-4 py-2 text-xs text-ink"
          >
            <span className="min-w-0 flex-1 break-words">{notice}</span>
            <button
              type="button"
              aria-label="Закрыть сообщение"
              className="shrink-0 text-ink-60"
              onClick={() => {
                tasks.dismissNotice()
                setMessage(null)
              }}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <TaskList
            items={tasks.items}
            loading={tasks.loading}
            loadingMore={tasks.loadingMore}
            error={tasks.error}
            hasMore={tasks.hasMore}
            remaining={tasks.remaining}
            selectedId={selectedId}
            view={tasks.view}
            searching={tasks.search.trim() !== ''}
            onOpen={setSelectedId}
            onSetStatus={(taskId, status) => void setStatus(taskId, status)}
            onLoadMore={() => void tasks.loadMore()}
            onRetry={() => void reload()}
            onCreate={() => {
              setCreating(true)
            }}
          />
        </div>
      </div>

      <div
        hidden={!panes.details}
        className={`${panes.details ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col`}
      >
        {selectedId === null ? (
          <p className="m-auto px-4 text-center text-sm text-ink-60">Выберите задачу</p>
        ) : (
          <TaskDetails
            key={`${selectedId}:${String(detailsVersion)}`}
            taskId={selectedId}
            onBack={
              panes.backToList
                ? () => {
                    setSelectedId(null)
                  }
                : undefined
            }
            onChanged={changed}
            onMissing={missing}
          />
        )}
      </div>
    </section>
  )
}
