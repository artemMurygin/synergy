import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskStatus } from '@/shared/tasks-api'
import { isWidePanel } from '../panel-layout'
import { CloseIcon } from '../icons'
import { PanelHeader } from '../PanelHeader'
import { useViewportSize } from '../use-viewport-size'
import { TaskCreateSheet } from './TaskCreateSheet'
import { TaskDetails } from './TaskDetails'
import { TaskList } from './TaskList'
import { TaskNotFound } from './TaskNotFound'
import { TasksToolbar } from './TasksToolbar'
import { tasksPaneVisibility } from './tasks-layout'
import { useTasks } from './use-tasks'

/**
 * Tasks screen: one state for both layouts. A wide panel (>= 640 px) shows the list and the
 * details side by side, a narrow one shows either of them; the hidden pane stays mounted so
 * scroll position and the selection survive a width change.
 */
export function TasksSplitView({
  userId,
  login,
  switcher,
  requestedTaskId = null,
  onTaskRequestHandled,
  notifications,
}: {
  userId: string
  login: string
  switcher: ReactNode
  requestedTaskId?: string | null
  onTaskRequestHandled?: () => void
  notifications?: ReactNode
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
  const createButton = useRef<HTMLButtonElement>(null)

  const [openedRequest, setOpenedRequest] = useState<string | null>(null)
  const [lastRequestedId, setLastRequestedId] = useState<string | null>(null)
  const [missingRequestedId, setMissingRequestedId] = useState<string | null>(null)
  if (requestedTaskId !== openedRequest) {
    setOpenedRequest(requestedTaskId)
    if (requestedTaskId !== null) {
      setSelectedId(requestedTaskId)
      setLastRequestedId(requestedTaskId)
      setMissingRequestedId(null)
      setMessage(null)
    }
  }
  useEffect(() => {
    if (requestedTaskId !== null) onTaskRequestHandled?.()
  }, [requestedTaskId, onTaskRequestHandled])

  // Focus goes back to "+" once the create sheet is closed.
  const wasCreating = useRef(false)
  useEffect(() => {
    if (wasCreating.current && !creating) createButton.current?.focus()
    wasCreating.current = creating
  }, [creating])

  const setStatus = async (taskId: string, status: TaskStatus) => {
    await tasks.setStatus(taskId, status)
    if (taskId === selectedId) setDetailsVersion((version) => version + 1)
  }

  const missing = useCallback(
    (taskId: string) => {
      if (taskId === lastRequestedId) {
        setMissingRequestedId(taskId)
        void reload()
        return
      }
      setSelectedId((current) => (current === taskId ? null : current))
      setMessage('Задача не найдена: возможно, её удалили')
      void reload()
    },
    [reload, lastRequestedId],
  )
  const changed = useCallback(() => {
    void reload()
  }, [reload])

  const notice = tasks.notice ?? message

  return (
    <section aria-label="Задачи" className="flex min-h-0 flex-1 flex-col">
      <div inert={creating} className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          actionRef={createButton}
          switcher={switcher}
          actionLabel="Новая задача"
          actionExpanded={creating}
          onAction={() => {
            setCreating((open) => !open)
          }}
          onOpenSettings={() => void chrome.runtime.openOptionsPage()}
          notifications={notifications}
        />
        <div className="flex min-h-0 flex-1">
          <div
            hidden={!panes.list}
            className={`${panes.list ? 'flex' : 'hidden'} min-h-0 flex-col ${
              isWidePanel(widthPx) ? 'w-85 shrink-0 border-r border-line' : 'min-w-0 flex-1'
            }`}
          >
            <TasksToolbar
              view={tasks.view}
              search={tasks.search}
              onViewChange={tasks.setView}
              onSearchChange={tasks.setSearch}
            />
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
                total={tasks.items.length + tasks.remaining}
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
              <p className="m-auto px-4 text-center font-heading text-base font-semibold text-ink-60">
                Выберите задачу
              </p>
            ) : selectedId === missingRequestedId ? (
              <TaskNotFound
                onBack={
                  panes.backToList
                    ? () => {
                        setSelectedId(null)
                      }
                    : undefined
                }
                onShowList={() => {
                  setSelectedId(null)
                }}
              />
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
        </div>
      </div>
      {creating && (
        <TaskCreateSheet
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
    </section>
  )
}
