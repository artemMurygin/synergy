import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TASK_STATUSES,
  TaskNotFoundError,
  downloadAttachment,
  getTask,
  updateTask,
} from '@/shared/tasks-api'
import type {
  Attachment,
  TaskDetails as TaskDetailsData,
  TaskStatus,
  UpdateTaskInput,
  UserSummary,
} from '@/shared/tasks-api'
import { ArrowLeftIcon, CalendarIcon, DownloadIcon, FileIcon, PencilIcon } from '../icons'
import { formatDeadline, formatSize, fromLocalInput, messageOf, toLocalInput } from './format'
import { STATUS_LABEL } from './StatusBadge'
import { UserSearchSelect } from './UserSearchSelect'

interface Props {
  taskId: string
  /** Omitted when the list is always visible next to the details (wide panel). */
  onBack?: () => void
  /** The task changed on the server: the list is stale. */
  onChanged: () => void
  /** The server no longer has the task (404). */
  onMissing: (taskId: string) => void
}

const field =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-60'
const primary =
  'rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:bg-ink-40'
const secondary =
  'rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sunken'

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

interface Draft {
  title: string
  description: string
  deadline: string
  assignee: UserSummary | null
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px]">
      <dt className="shrink-0 text-ink-60">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  )
}

function AttachmentRow(props: { attachment: Attachment; onDownload: (a: Attachment) => void }) {
  const { attachment } = props
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-alt py-2 pr-2 pl-3.5">
      <span className="shrink-0 text-ink-60">
        <FileIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium break-words text-ink">{attachment.originalName}</span>
        <span className="text-xs text-ink-60">{formatSize(attachment.sizeBytes)}</span>
      </div>
      <button
        type="button"
        aria-label={`Скачать ${attachment.originalName}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-xl text-ink-60 hover:bg-white"
        onClick={() => {
          props.onDownload(attachment)
        }}
      >
        <DownloadIcon />
      </button>
    </li>
  )
}

/** Task screen: fields, one-click status, editing and attachment download. */
export function TaskDetails({ taskId, onBack, onChanged, onMissing }: Props) {
  const [task, setTask] = useState<TaskDetailsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const id = ++latest.current
    setLoadError(null)
    try {
      const loaded = await getTask(taskId)
      if (id !== latest.current) return
      setTask(loaded)
    } catch (failure) {
      if (id !== latest.current) return
      if (failure instanceof TaskNotFoundError) onMissing(taskId)
      else setLoadError(messageOf(failure))
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [taskId, onMissing])

  useEffect(() => {
    Promise.resolve().then(load, load)
    return () => {
      latest.current += 1
    }
  }, [load])

  const apply = async (patch: UpdateTaskInput): Promise<boolean> => {
    setActionError(null)
    try {
      const updated = await updateTask(taskId, patch)
      setTask(updated)
      onChanged()
      return true
    } catch (failure) {
      if (failure instanceof TaskNotFoundError) onMissing(taskId)
      else setActionError(`Не удалось сохранить: ${messageOf(failure)}`)
      return false
    }
  }

  const changeStatus = async (status: TaskStatus) => {
    if (task === null || task.status === status) return
    const before = task
    setTask({ ...task, status })
    const ok = await apply({ status })
    if (!ok) setTask(before)
  }

  const save = async () => {
    if (task === null || draft === null || draft.title.trim() === '') return
    const patch: UpdateTaskInput = {}
    if (draft.title.trim() !== task.title) patch.title = draft.title.trim()
    if (draft.description !== task.description) patch.description = draft.description
    if (draft.deadline !== toLocalInput(task.deadline))
      patch.deadline = fromLocalInput(draft.deadline)
    if (draft.assignee !== null && draft.assignee.id !== task.assignee?.id) {
      patch.assigneeId = draft.assignee.id
    }
    if (Object.keys(patch).length === 0) {
      setDraft(null)
      return
    }
    setSaving(true)
    const ok = await apply(patch)
    setSaving(false)
    if (ok) setDraft(null)
  }

  const download = async (attachment: Attachment) => {
    setActionError(null)
    try {
      const file = await downloadAttachment(taskId, attachment.id)
      saveBlob(file.blob, file.fileName)
    } catch (failure) {
      setActionError(`Не удалось скачать файл: ${messageOf(failure)}`)
    }
  }

  const header = (
    <header className="flex items-center gap-2 border-b border-line px-3 py-2">
      {onBack && (
        <button
          type="button"
          aria-label="Назад"
          className="flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-alt"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </button>
      )}
      <span className="flex-1 text-base font-semibold text-ink">Задача</span>
      {task !== null && draft === null && (
        <button
          type="button"
          aria-label="Редактировать"
          className="flex size-8 items-center justify-center rounded-lg text-ink-60 hover:bg-surface-alt"
          onClick={() => {
            setDraft({
              title: task.title,
              description: task.description,
              deadline: toLocalInput(task.deadline),
              assignee: null,
            })
          }}
        >
          <PencilIcon />
        </button>
      )}
    </header>
  )

  if (loading) {
    return (
      <section aria-label="Детали задачи" className="flex min-h-0 flex-1 flex-col">
        {header}
        <div
          role="status"
          aria-label="Загрузка задачи"
          className="flex animate-pulse flex-col gap-3 p-4"
        >
          <div className="h-4 w-3/4 rounded bg-surface-sunken" />
          <div className="h-3 w-1/2 rounded bg-surface-sunken" />
          <div className="h-3 w-2/3 rounded bg-surface-sunken" />
        </div>
      </section>
    )
  }

  if (task === null) {
    return (
      <section aria-label="Детали задачи" className="flex min-h-0 flex-1 flex-col">
        {header}
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <p className="text-sm break-words text-ink">
            {loadError ?? 'Не удалось загрузить задачу'}
          </p>
          <button
            type="button"
            className={secondary}
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            Повторить
          </button>
        </div>
      </section>
    )
  }

  const current = task.assignee
  const chosen: UserSummary | null =
    draft?.assignee ?? (current?.login != null ? { id: current.id, login: current.login } : null)

  return (
    <section aria-label="Детали задачи" className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {draft === null ? (
          <h2 className="text-lg font-bold break-words text-ink">{task.title}</h2>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-ink-60">
            Название
            <input
              type="text"
              value={draft.title}
              className={field}
              onChange={(event) => {
                setDraft({ ...draft, title: event.target.value })
              }}
            />
          </label>
        )}

        <div role="radiogroup" aria-label="Статус" className="flex flex-wrap gap-2">
          {TASK_STATUSES.map((status) => {
            const active = task.status === status
            return (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={active}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                  active
                    ? 'border-info bg-info-soft text-info'
                    : 'border-line bg-white text-ink hover:bg-surface-alt'
                }`}
                onClick={() => {
                  void changeStatus(status)
                }}
              >
                {STATUS_LABEL[status]}
              </button>
            )
          })}
        </div>

        {draft === null ? (
          <dl className="flex flex-col gap-2">
            <Row label="Ответственный">{task.assignee?.login ?? 'Не назначен'}</Row>
            <Row label="Дедлайн">
              {task.deadline === null ? (
                'Без срока'
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon />
                  {formatDeadline(task.deadline)}
                </span>
              )}
            </Row>
            <Row label="Наблюдатели">
              {task.watchers.length === 0
                ? 'Нет'
                : task.watchers.map((w) => w.login ?? 'неактивен').join(', ')}
            </Row>
            <Row label="Создатель">{task.creator.login ?? 'неактивен'}</Row>
          </dl>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-60">
              Дедлайн
              <input
                type="datetime-local"
                value={draft.deadline}
                className={field}
                onChange={(event) => {
                  setDraft({ ...draft, deadline: event.target.value })
                }}
              />
            </label>
            <div className="flex flex-col gap-1 text-xs text-ink-60">
              <span>{`Ответственный: ${chosen?.login ?? 'не назначен'}`}</span>
              <UserSearchSelect
                value={chosen}
                onChange={(user) => {
                  setDraft({ ...draft, assignee: user })
                }}
              />
            </div>
          </div>
        )}

        {draft === null ? (
          task.description !== '' && (
            <p className="text-[13px] break-words whitespace-pre-wrap text-ink">
              {task.description}
            </p>
          )
        ) : (
          <label className="flex flex-col gap-1 text-xs text-ink-60">
            Описание
            <textarea
              rows={4}
              value={draft.description}
              className={field}
              onChange={(event) => {
                setDraft({ ...draft, description: event.target.value })
              }}
            />
          </label>
        )}

        {actionError !== null && (
          <p role="alert" className="text-xs break-words text-brand-red">
            {actionError}
          </p>
        )}

        {draft !== null && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setDraft(null)
                setActionError(null)
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className={primary}
              disabled={saving || draft.title.trim() === ''}
              onClick={() => {
                void save()
              }}
            >
              Сохранить
            </button>
          </div>
        )}

        {task.attachments.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink-60">
              {`Вложения · ${String(task.attachments.length)}`}
            </span>
            <ul className="flex flex-col gap-2">
              {task.attachments.map((attachment) => (
                <AttachmentRow
                  key={attachment.id}
                  attachment={attachment}
                  onDownload={(a) => {
                    void download(a)
                  }}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
