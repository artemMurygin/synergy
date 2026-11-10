import { X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { BackendError, TaskNotFoundError, TaskUserNotFoundError } from '@/lib/backend/errors'
import type { CreateTaskInput } from '@/lib/backend/tasks.api'
import { useDeleteTask, useTask, useUpdateTask } from '@/lib/backend/tasks.queries'
import { TASK_STATUSES, type TaskDetails, type TaskStatus, type TaskUser } from '@/lib/backend/tasks.schema'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore } from '@/stores/ui.store'
import { fieldErrorsFromError } from './field-errors'
import { AttachmentList } from './AttachmentList'
import { USER_NOT_FOUND_TEXT } from './CreateTaskDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { StatusBadge } from './StatusBadge'
import { STATUS_META, isOverdue } from './status'
import { TaskForm, type TaskFormErrors, type TaskFormInitial } from './TaskForm'
import { diffTask } from './task-diff'

const GONE_NOTICE_MS = 5000
const PANEL_CLASS =
  'absolute top-0 right-0 bottom-0 z-30 flex w-[440px] max-w-full flex-col border-l bg-background shadow-xl outline-none'

const dateTime = (iso: string): string =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  )

const loginOf = (user: TaskUser): string => user.login ?? 'Неактивный пользователь'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <dt className="w-[110px] shrink-0 pt-0.5 text-[13px] text-ink-60">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-7 items-center rounded-full bg-surface-sunken px-3 text-[13px] font-medium">{children}</span>
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

function GoneNotice({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, GONE_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [onClose])
  return (
    <aside role="complementary" aria-label="Детали задачи" className={PANEL_CLASS}>
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-base font-semibold">Задача удалена</h2>
        <p className="max-w-[300px] text-[13px] text-muted-foreground">Её удалил другой пользователь. Список обновлён.</p>
        <Button type="button" variant="outline" className="h-10 rounded-full px-5" onClick={onClose}>
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

  const changeStatus = (status: TaskStatus) => {
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
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
        <h2 className="flex-1 text-[13px] font-semibold text-ink-60">Задача</h2>
        <button
          type="button"
          aria-label="Закрыть панель"
          onClick={close}
          className="flex size-9 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {query.isPending && (
          <div role="status" aria-label="Загрузка задачи" className="flex flex-col gap-4">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
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
            <div className="flex items-start gap-3">
              <h2 className="flex-1 text-xl leading-snug font-semibold [overflow-wrap:anywhere]">{task.title}</h2>
              <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={() => setEditing(true)}>
                Редактировать
              </Button>
            </div>
            <dl className="flex flex-col gap-3">
              <Row label="Статус">
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  <select
                    aria-label="Статус"
                    value={task.status}
                    onChange={(event) => changeStatus(event.target.value as TaskStatus)}
                    className="h-8 rounded-md border border-border-strong bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {TASK_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_META[status].label}
                      </option>
                    ))}
                  </select>
                </div>
              </Row>
              <Row label="Ответственный">{task.assignee ? <Chip>{loginOf(task.assignee)}</Chip> : <span className="text-ink-60">Не назначен</span>}</Row>
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
                  <span className="text-ink-60">Нет</span>
                )}
              </Row>
              <Row label="Дедлайн">
                {task.deadline ? (
                  <span>
                    {dateTime(task.deadline)}
                    {isOverdue(task.status, task.deadline) && <span className="ml-2 font-semibold text-brand-red">Просрочено</span>}
                  </span>
                ) : (
                  <span className="text-ink-60">Не задан</span>
                )}
              </Row>
              <Row label="Создатель">{loginOf(task.creator)}</Row>
            </dl>
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-60 uppercase">Описание</h3>
              <p className="rounded-xl bg-surface-alt px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
                {task.description === '' ? 'Описание не задано' : task.description}
              </p>
            </div>
            <AttachmentList taskId={task.id} attachments={task.attachments} />
          </>
        )}
      </div>

      {task && !editing && (
        <footer className="flex shrink-0 items-center gap-3 border-t px-6 py-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded text-sm font-semibold text-brand-red outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Удалить задачу
          </button>
          <p className="flex-1 text-right text-xs leading-snug text-ink-60">
            <span className="block">Создана {dateTime(task.createdAt)}</span>
            <span className="block">Изменена {dateTime(task.updatedAt)}</span>
            {task.status === 'done' && task.completedAt && <span className="block">Закрыта {dateTime(task.completedAt)}</span>}
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
  const onOpen = useRef(() => setGone(false)).current
  const onGone = useRef(() => setGone(true)).current

  if (id === null) return gone ? <GoneNotice onClose={onOpen} /> : null
  return <DrawerBody key={id} id={id} onOpen={onOpen} onGone={onGone} />
}
