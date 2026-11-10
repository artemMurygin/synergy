import { Calendar, FileX, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BackendError, TaskNotFoundError, TaskUserNotFoundError } from '@/lib/backend/errors'
import type { CreateTaskInput } from '@/lib/backend/tasks.api'
import { useDeleteTask, useTask, useUpdateTask } from '@/lib/backend/tasks.queries'
import { TASK_STATUSES, type TaskDetails, type TaskStatus, type TaskUser } from '@/lib/backend/tasks.schema'
import { useNotificationsStore } from '@/stores/notifications.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { fieldErrorsFromError } from './field-errors'
import { AttachmentList } from './AttachmentList'
import { USER_NOT_FOUND_TEXT } from './CreateTaskDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { STATUS_META, isOverdue } from './status'
import { TaskForm, type TaskFormErrors, type TaskFormInitial } from './TaskForm'
import { diffTask } from './task-diff'
import { formatFullDateTime, formatRelativeDateTime } from './task-dates'
import { UserAvatar } from './UserAvatar'

const GONE_NOTICE_MS = 5000
// a column beside the list (not an overlay): the list narrows while the panel is open
const PANEL_CLASS =
  'flex h-full w-[480px] shrink-0 flex-col border-l bg-background shadow-[-8px_0_24px_rgba(0,0,0,0.06)] outline-none'
const ICON_BUTTON_CLASS =
  'flex size-9 items-center justify-center rounded-md text-ink outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring'
const SECTION_LABEL_CLASS = 'text-[11px] font-bold tracking-wide text-ink-40 uppercase'

const loginOf = (user: TaskUser): string => user.login ?? 'Неактивный пользователь'

function PanelHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-1 border-b pr-4 pl-6">
      <h2 className="flex-1 text-[13px] font-semibold text-ink-60">Задача</h2>
      {children}
    </header>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3">
      <dt className="w-[116px] shrink-0 text-[13px] text-ink-60">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</dd>
    </div>
  )
}

function Person({ user }: { user: TaskUser | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <UserAvatar login={user?.login ?? null} />
      {user ? (
        <span className="truncate text-sm font-medium">{loginOf(user)}</span>
      ) : (
        <span className="text-sm text-ink-40">Не назначен</span>
      )}
    </span>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-8 items-center rounded-full border border-border-strong bg-background px-2.5 text-[13px] font-medium">
      {children}
    </span>
  )
}

// larger variant of StatusBadge used in the panel (padding 8×14, 13px)
function PanelStatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[7px] rounded-full px-3.5 py-2 text-[13px] leading-none font-semibold whitespace-nowrap',
        meta.badgeClass
      )}
    >
      <span aria-hidden className={cn('size-[7px] rounded-full', meta.dotClass)} />
      {meta.label}
    </span>
  )
}

function toInitial(task: TaskDetails): TaskFormInitial {
  const visible = (user: TaskUser) => (user.login === null ? [] : [{ id: user.id, login: user.login }])
  return {
    title: task.title,
    description: task.description,
    deadline: task.deadline,
    assignee: task.assignee ? (visible(task.assignee)[0] ?? null) : null,
    watchers: task.watchers.flatMap(visible)
  }
}

const GONE_TEXT = { title: 'Задача удалена', caption: 'Её удалил другой пользователь. Список обновлён.' }
const NOT_FOUND_CAPTION = 'Её удалили или у вас больше нет к ней доступа. Уведомление отмечено прочитанным.'

function GoneNotice({ onClose }: { onClose: () => void }) {
  const notice = useNotificationsStore((s) => s.notice)
  const title = notice ?? GONE_TEXT.title
  const caption = notice === null ? GONE_TEXT.caption : NOT_FOUND_CAPTION
  useEffect(() => {
    const timer = setTimeout(onClose, GONE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <aside role="complementary" aria-label="Детали задачи" className={PANEL_CLASS}>
      <PanelHeader>
        <button type="button" aria-label="Закрыть панель" onClick={onClose} className={ICON_BUTTON_CLASS}>
          <X aria-hidden className="size-5" />
        </button>
      </PanelHeader>
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-surface-sunken text-ink-60">
          <FileX aria-hidden className="size-7" />
        </span>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="max-w-[300px] text-[13px] text-ink-60">{caption}</p>
        <Button type="button" variant="outline" className="mt-1 h-10 rounded-full px-5" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </aside>
  )
}

interface BodyProps {
  id: string
  onOpen: () => void
  onGone: () => void
}

function DrawerBody({ id, onOpen, onGone }: BodyProps) {
  const query = useTask(id)
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const selectTask = useTasksStore((s) => s.selectTask)
  const panel = useRef<HTMLElement>(null)
  const [editing, setEditing] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const statusButton = useRef<HTMLButtonElement>(null)
  const refocusStatus = useRef(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<TaskFormErrors>({})
  const notFound = query.error instanceof TaskNotFoundError

  const close = () => {
    selectTask(null)
    document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)?.focus()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    onOpen()
    panel.current?.focus()
  }, [onOpen])

  useEffect(() => {
    if (notFound) onGone()
  }, [notFound, onGone])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // the panel stays mounted but hidden in the chats section: Escape there is not ours
      if (useUiStore.getState().section !== 'tasks') return
      // Escape belongs to an open dialog or list first
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="listbox"]')) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleFailure = (error: unknown, fallback: string) => {
    if (error instanceof TaskNotFoundError) onGone()
    else setMessage(error instanceof BackendError ? error.message : fallback)
  }

  // after a pick or Escape focus goes back to «Изменить» instead of falling to <body>
  const closeStatus = () => {
    refocusStatus.current = true
    setStatusOpen(false)
  }
  useEffect(() => {
    if (statusOpen || !refocusStatus.current) return
    refocusStatus.current = false
    statusButton.current?.focus()
  }, [statusOpen])

  const changeStatus = (status: TaskStatus) => {
    closeStatus()
    setMessage(null)
    update.mutateAsync({ id, patch: { status } }).catch((error: unknown) => {
      handleFailure(error, 'Не удалось изменить статус. Он возвращён к прежнему.')
    })
  }

  const save = (task: TaskDetails, input: CreateTaskInput) => {
    const patch = diffTask(task, input)
    setMessage(null)
    setFieldErrors({})
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    update
      .mutateAsync({ id, patch })
      .then(() => setEditing(false))
      .catch((error: unknown) => {
        const found = fieldErrorsFromError(error)
        if (error instanceof TaskUserNotFoundError) setFieldErrors({ participants: USER_NOT_FOUND_TEXT })
        else if (found) setFieldErrors(found)
        else handleFailure(error, 'Не удалось сохранить изменения')
      })
  }

  const deleteTask = () => {
    remove.mutateAsync(id).catch((error: unknown) => {
      setConfirmOpen(false)
      handleFailure(error, 'Не удалось удалить задачу')
    })
  }

  const task = query.data
  const failed = query.isError && !notFound

  return (
    <aside ref={panel} tabIndex={-1} role="complementary" aria-label="Детали задачи" className={PANEL_CLASS}>
      <PanelHeader>
        {task && !editing && (
          <button type="button" aria-label="Редактировать" title="Редактировать" onClick={() => setEditing(true)} className={ICON_BUTTON_CLASS}>
            <Pencil aria-hidden className="size-[18px]" />
          </button>
        )}
        <button type="button" aria-label="Закрыть панель" onClick={close} className={ICON_BUTTON_CLASS}>
          <X aria-hidden className="size-5" />
        </button>
      </PanelHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
        {query.isPending && (
          <div role="status" aria-label="Загрузка задачи" className="flex flex-col gap-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3.5 w-7/12" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-3.5 w-5/12" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {failed && (
          <div role="alert" className="flex flex-col items-start gap-3 text-sm">
            <p className="text-brand-red">Не удалось загрузить задачу.</p>
            <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          </div>
        )}

        {message && (
          <p role="alert" className="rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
            {message}
          </p>
        )}

        {task && editing && (
          <div className="-mx-6">
            <TaskForm
              initial={toInitial(task)}
              submitLabel="Сохранить"
              submitting={update.isPending}
              fieldErrors={fieldErrors}
              onSubmit={(input) => save(task, input)}
              onCancel={() => {
                setEditing(false)
                setFieldErrors({})
              }}
            />
          </div>
        )}

        {task && !editing && (
          <>
            <h2 title={task.title} className="line-clamp-2 font-display text-[22px] leading-tight font-bold [overflow-wrap:anywhere]">
              {task.title}
            </h2>
            <dl className="flex flex-col gap-4">
              <Row label="Статус">
                {statusOpen ? (
                  <select
                    aria-label="Статус"
                    autoFocus
                    // open the list right away: arrow keys on a closed select would change the status at once
                    ref={(select) => {
                      try {
                        select?.showPicker()
                      } catch {
                        // showPicker is unavailable or not allowed here
                      }
                    }}
                    value={task.status}
                    onChange={(event) => changeStatus(event.target.value as TaskStatus)}
                    onBlur={() => setStatusOpen(false)}
                    onKeyDown={(event) => {
                      // close the picker, not the panel
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        closeStatus()
                      }
                    }}
                    className="h-8 rounded-md border border-border-strong bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <PanelStatusBadge status={task.status} />
                    <button
                      type="button"
                      ref={statusButton}
                      aria-label="Изменить статус"
                      onClick={() => setStatusOpen(true)}
                      className="rounded text-[13px] font-semibold text-brand-red outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Изменить
                    </button>
                  </>
                )}
              </Row>
              <Row label="Ответственный">
                <Person user={task.assignee} />
              </Row>
              <Row label="Наблюдатели">
                {task.watchers.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {task.watchers.map((watcher) => (
                      <li key={watcher.id}>
                        <Chip>{loginOf(watcher)}</Chip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm text-ink-40">Нет</span>
                )}
              </Row>
              <Row label="Дедлайн">
                <Calendar aria-hidden className="size-4 shrink-0 text-ink-60" />
                {task.deadline ? (
                  <>
                    <span className="text-sm font-medium">{formatFullDateTime(task.deadline)}</span>
                    {isOverdue(task.status, task.deadline) && <span className="text-[13px] text-brand-red">Просрочено</span>}
                  </>
                ) : (
                  <span className="text-sm text-ink-40">Без срока</span>
                )}
              </Row>
              <Row label="Создатель">
                <Person user={task.creator} />
              </Row>
              {task.status === 'done' && task.completedAt && (
                <Row label="Закрыта">
                  <span className="text-sm font-medium">{formatFullDateTime(task.completedAt)}</span>
                </Row>
              )}
            </dl>
            <div className="flex flex-col gap-2">
              <h3 className={SECTION_LABEL_CLASS}>Описание</h3>
              <p
                className={cn(
                  'rounded-md bg-surface-alt p-3.5 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap',
                  task.description === '' && 'text-ink-40'
                )}
              >
                {task.description === '' ? 'Описание не задано' : task.description}
              </p>
            </div>
            <AttachmentList taskId={task.id} attachments={task.attachments} />
          </>
        )}
      </div>

      {task && !editing && (
        <footer className="flex h-16 shrink-0 items-center gap-3 border-t px-6">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="-ml-3 flex h-10 items-center gap-2 rounded-md px-3 text-[15px] font-semibold text-brand-red outline-none hover:bg-brand-red-soft focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 aria-hidden className="size-[18px]" />
            Удалить задачу
          </button>
          <p
            className="flex-1 text-right text-xs text-ink-60"
            title={`Создана ${formatFullDateTime(task.createdAt)}\nИзменена ${formatFullDateTime(task.updatedAt)}`}
          >
            Изменена {formatRelativeDateTime(task.updatedAt)}
          </p>
        </footer>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Удалить задачу?"
        description={task ? `Задача «${task.title}» и её вложения будут удалены без возможности восстановления.` : ''}
        confirmLabel="Удалить"
        pending={remove.isPending}
        onConfirm={deleteTask}
      />
    </aside>
  )
}

/** Right-hand panel with the selected task; renders nothing while no task is selected. */
export function TaskDrawer() {
  const id = useTasksStore((s) => s.selectedTaskId)
  // set when the open task turned out to be deleted: the panel stays to say so, then closes itself
  const [gone, setGone] = useState(false)
  const onOpen = useRef(() => {
    setGone(false)
    useNotificationsStore.getState().clearNotice()
  }).current
  const onGone = useRef(() => setGone(true)).current

  if (id === null) return gone ? <GoneNotice onClose={onOpen} /> : null
  return <DrawerBody key={id} id={id} onOpen={onOpen} onGone={onGone} />
}
