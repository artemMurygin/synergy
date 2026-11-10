import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
import {
  ArrowLeftIcon,
  CalendarIcon,
  ChevronDownIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  PencilIcon,
  UserIcon,
} from '../icons'
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

// Поля формы редактирования: обводка и красный фокус как в макете.
const field =
  'w-full rounded-xl border border-field-line bg-white text-ink outline-none placeholder:text-ink-40 focus:border-brand-red'
const fieldLabel = 'text-xs font-semibold text-ink-60'
const secondary =
  'rounded-full border border-field-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-alt'
const headerButton =
  'flex size-9 shrink-0 items-center justify-center rounded-xl hover:bg-surface-alt'

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

/** Две колонки: подпись фиксированной ширины и значение (макет: 96 px + 10 px). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-2.5">
      <dt className="text-xs text-ink-60">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-[13px] font-medium break-words text-ink">
        {children}
      </dd>
    </div>
  )
}

/** Две буквы для аватара: первые буквы частей логина ("ivan.petrov" → "IP") или первые две. */
export function initials(login: string): string {
  const parts = login.split(/[\s._-]+/).filter((part) => part !== '')
  const letters =
    parts.length >= 2 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : login.slice(0, 2)
  return letters.toUpperCase()
}

function Avatar({ login }: { login: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold text-ink-80"
    >
      {initials(login)}
    </span>
  )
}

/** Ответственный в форме: закрытое поле со стрелкой, по клику — поиск пользователей. */
function AssigneeSelect(props: {
  value: UserSummary | null
  onChange: (user: UserSummary) => void
}) {
  const [open, setOpen] = useState(false)
  const login = props.value?.login ?? 'Не назначен'
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ответственный: ${login}`}
        className={`${field} flex h-11 items-center gap-2.5 px-4 text-left`}
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <span className="shrink-0 text-ink-40">
          <UserIcon />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px]">{login}</span>
        <span className={`shrink-0 text-ink-60 transition-transform ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>
      {open && (
        <UserSearchSelect
          autoFocus
          value={props.value}
          onChange={(user) => {
            props.onChange(user)
            setOpen(false)
          }}
        />
      )}
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
      <div className="flex min-w-0 flex-1 flex-col gap-px">
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
  const formId = useId()
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

  const cancelEdit = () => {
    setDraft(null)
    setActionError(null)
  }

  const header =
    draft === null ? (
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
        {onBack && (
          <button
            type="button"
            aria-label="Назад"
            className={`${headerButton} text-ink`}
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </button>
        )}
        <span className="min-w-0 flex-1 truncate px-1 font-heading text-base font-semibold text-ink">
          Задача
        </span>
        {task !== null && (
          <button
            type="button"
            aria-label="Редактировать"
            className={`${headerButton} text-ink-60`}
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
    ) : (
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-3">
        <button
          type="button"
          aria-label="Отмена"
          title="Отменить редактирование"
          className={`${headerButton} text-ink`}
          onClick={cancelEdit}
        >
          <CloseIcon />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 font-heading text-base font-semibold text-ink">
          Редактирование
        </span>
        <button
          type="button"
          className="h-8.5 shrink-0 rounded-xl bg-brand-red px-4 text-[13px] font-semibold text-white shadow-[0_6px_12px_#66000033] hover:bg-brand-red-hover disabled:bg-ink-40 disabled:shadow-none"
          disabled={saving || draft.title.trim() === ''}
          onClick={() => {
            void save()
          }}
        >
          Сохранить
        </button>
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

  const attachments = task.attachments.length > 0 && (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold tracking-[0.6px] text-ink-40 uppercase">
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
  )

  const errorText = actionError !== null && (
    <p role="alert" className="text-xs break-words text-brand-red">
      {actionError}
    </p>
  )

  if (draft !== null) {
    // Форма редактирования: Название → Описание → Дедлайн → Ответственный. Статус и вложения
    // не редактируются здесь и не отправляются: сохранение шлёт только изменённые поля.
    return (
      <section aria-label="Детали задачи" className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-title`} className={fieldLabel}>
              Название
            </label>
            <input
              id={`${formId}-title`}
              type="text"
              value={draft.title}
              className={`${field} h-11 px-4 text-sm`}
              onChange={(event) => {
                setDraft({ ...draft, title: event.target.value })
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-description`} className={fieldLabel}>
              Описание
            </label>
            <textarea
              id={`${formId}-description`}
              rows={4}
              value={draft.description}
              className={`${field} resize-y p-3 text-[13px] leading-[1.4]`}
              onChange={(event) => {
                setDraft({ ...draft, description: event.target.value })
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-deadline`} className={fieldLabel}>
              Дедлайн
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-40">
                <CalendarIcon />
              </span>
              <input
                id={`${formId}-deadline`}
                type="datetime-local"
                value={draft.deadline}
                /* Своя иконка календаря слева, поэтому системный значок скрыт; выбор даты — по клику. */
                className={`${field} h-11 pr-11 pl-10 text-[15px] [&::-webkit-calendar-picker-indicator]:hidden`}
                onClick={(event) => {
                  try {
                    event.currentTarget.showPicker()
                  } catch {
                    // showPicker недоступен (jsdom, старый браузер): остаётся ручной ввод.
                  }
                }}
                onChange={(event) => {
                  setDraft({ ...draft, deadline: event.target.value })
                }}
              />
              {draft.deadline !== '' && (
                <button
                  type="button"
                  aria-label="Очистить дедлайн"
                  className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-60 hover:bg-surface-alt hover:text-ink"
                  onClick={() => {
                    setDraft({ ...draft, deadline: '' })
                  }}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Ответственный</span>
            <AssigneeSelect
              value={chosen}
              onChange={(user) => {
                setDraft({ ...draft, assignee: user })
              }}
            />
          </div>
          {errorText}
          {attachments}
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Детали задачи" className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
        <h2 className="font-heading text-lg leading-snug font-bold break-words text-ink">
          {task.title}
        </h2>

        <div role="radiogroup" aria-label="Статус" className="flex flex-wrap gap-1.5">
          {TASK_STATUSES.map((status) => {
            const active = task.status === status
            return (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={active}
                className={`h-8.5 rounded-full border px-3 text-[13px] font-medium ${
                  active
                    ? 'border-info bg-info-soft text-info'
                    : 'border-field-line bg-white text-ink hover:bg-surface-alt'
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

        <dl className="flex flex-col gap-3">
          <Row label="Ответственный">
            {task.assignee?.login != null ? (
              <>
                <Avatar login={task.assignee.login} />
                <span className="min-w-0 break-words">{task.assignee.login}</span>
              </>
            ) : (
              <span className="text-ink-60">Не назначен</span>
            )}
          </Row>
          <Row label="Дедлайн">
            {task.deadline === null ? (
              'Без срока'
            ) : (
              <>
                <span className="shrink-0 text-ink-60">
                  <CalendarIcon />
                </span>
                {formatDeadline(task.deadline)}
              </>
            )}
          </Row>
          <Row label="Наблюдатели">
            {task.watchers.length === 0
              ? 'Нет'
              : task.watchers.map((w) => w.login ?? 'неактивен').join(', ')}
          </Row>
          <Row label="Создатель">{task.creator.login ?? 'неактивен'}</Row>
        </dl>

        {task.description !== '' && (
          <p className="text-[13px] leading-[1.45] break-words whitespace-pre-wrap text-ink-80">
            {task.description}
          </p>
        )}

        {errorText}
        {attachments}
      </div>
    </section>
  )
}
