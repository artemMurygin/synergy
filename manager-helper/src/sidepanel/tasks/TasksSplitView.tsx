import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TaskStatus } from '@/shared/tasks-api'
import {
  PanelHeader,
  TaskFilters,
  TaskList,
  TaskNotFound,
  tasksPaneVisibility,
  useLayoutMode,
} from '@synergy/ui-kit'
import { FileText, X } from '@synergy/ui-kit/icons'
import { PanelActions } from '../PanelActions'
import { TaskCreateSheet } from './TaskCreateSheet'
import { TaskDetailsPane } from './TaskDetailsPane'
import { useOverdueCount, useTasks } from './use-tasks'

/**
 * Tasks screen: one state for both layouts. A wide panel (>= 640 px) shows the list and the
 * details side by side, a narrow one shows either of them; the hidden pane stays mounted so
 * scroll position and the selection survive a width change.
 */
export function TasksSplitView({
  userId,
  login,
  requestedTaskId = null,
  onTaskRequestHandled,
  trailing,
}: {
  userId: string
  login: string
  requestedTaskId?: string | null
  onTaskRequestHandled?: () => void
  /** Notifications and profile for the top bar of a narrow panel. */
  trailing?: ReactNode
}) {
  const tasks = useTasks(userId)
  const { reload } = tasks
  const layout = useLayoutMode()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Details are re-read after the list changed the selected task.
  const [detailsVersion, setDetailsVersion] = useState(0)
  // The overdue badge is re-read after every change of a task.
  const [overdueVersion, setOverdueVersion] = useState(0)
  const overdueCount = useOverdueCount(overdueVersion)
  const panes = tasksPaneVisibility(layout, selectedId)
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
    await tasks.setTaskStatus(taskId, status)
    setOverdueVersion((version) => version + 1)
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
    [reload, lastRequestedId, setMissingRequestedId, setSelectedId, setMessage],
  )
  const changed = useCallback(() => {
    void reload()
    setOverdueVersion((version) => version + 1)
  }, [reload])
  const deleted = useCallback(
    (taskId: string) => {
      setSelectedId((current) => (current === taskId ? null : current))
      changed()
    },
    [changed],
  )

  const notice = tasks.notice ?? message

  return (
    <section aria-label="Задачи" className="flex min-h-0 flex-1 flex-col">
      <div inert={creating} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          <div
            hidden={!panes.list}
            className={`${panes.list ? 'flex' : 'hidden'} min-h-0 flex-col ${
              layout !== 'mobile' ? 'w-68 shrink-0' : 'min-w-0 flex-1'
            }`}
          >
            <PanelHeader
              title="Задачи"
              actions={
                <PanelActions
                  actionRef={createButton}
                  actionLabel="Новая задача"
                  actionExpanded={creating}
                  onAction={() => {
                    setCreating((open) => !open)
                  }}
                  onOpenSettings={() => void chrome.runtime.openOptionsPage()}
                  trailing={trailing}
                />
              }
            />
            <TaskFilters
              view={tasks.query.view}
              onViewChange={tasks.setView}
              status={tasks.query.status}
              onStatusChange={tasks.setStatusFilter}
              sort={tasks.query.sort}
              onSortChange={tasks.setSort}
              overdueCount={overdueCount}
              search={tasks.query.search}
              onSearch={tasks.setSearch}
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
                  <X />
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
                view={tasks.query.view}
                searching={tasks.query.search.trim() !== ''}
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
            className={`${panes.details ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col ${
              layout !== 'mobile' ? 'border-l border-border' : ''
            }`}
          >
            {selectedId === null ? (
              <div className="m-auto flex max-w-[260px] flex-col items-center gap-3 px-4 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-surface-alt text-ink-60">
                  <FileText size={24} />
                </span>
                <h2 className="font-display text-lg font-semibold text-ink">Выберите задачу</h2>
                <p className="text-sm text-ink-60">Её детали откроются здесь.</p>
              </div>
            ) : selectedId === missingRequestedId ? (
              <TaskNotFound
                text="Её удалили или у вас больше нет к ней доступа. Уведомление отмечено прочитанным."
                onBack={() => {
                  setSelectedId(null)
                }}
              />
            ) : (
              <TaskDetailsPane
                key={`${selectedId}:${String(detailsVersion)}`}
                taskId={selectedId}
                me={{ id: userId, login }}
                onBack={
                  panes.backToList
                    ? () => {
                        setSelectedId(null)
                      }
                    : undefined
                }
                onChanged={changed}
                onMissing={missing}
                onDeleted={deleted}
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
