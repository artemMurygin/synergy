import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, Check, Pencil, Trash2, X } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'
import { Button } from '../primitives/Button'
import { Input } from '../primitives/Input'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../primitives/Menu'
import { Textarea } from '../primitives/Textarea'
import { AttachmentList, type AttachmentListProps } from './AttachmentList'
import { DeadlineField } from './DeadlinePicker'
import { formatFullDateTime, formatRelativeDateTime, isOverdue } from './deadline'
import { StatusBadge } from './StatusBadge'
import { TaskDeleteConfirm } from './TaskDeleteConfirm'
import { DESCRIPTION_MAX, TITLE_MAX } from './TaskFormFields'
import { loginOf, STATUS_LABEL, TASK_STATUSES, type TaskDetailsData, type TaskStatus, type UserSummary } from './types'
import { UserAvatar } from './UserAvatar'
import { UserPicker, type UserSearchProps } from './UserPicker'

export type TaskPatch = {
  title?: string
  description?: string
  deadline?: string | null
  assigneeId?: string | null
  watcherIds?: string[]
}

export type TaskDetailsProps = {
  task: TaskDetailsData
  now?: Date
  me?: UserSummary
  userSearch: UserSearchProps
  /** Правка полей: каждое изменение уходит отдельным патчем. */
  onPatch: (patch: TaskPatch) => void
  onStatus: (status: TaskStatus) => void
  onUpload: AttachmentListProps['onUpload']
  onDeleteAttachment: AttachmentListProps['onDelete']
  onDownload: AttachmentListProps['onDownload']
  onDelete: () => void
  /** Есть только в узких режимах: кнопка возврата к списку. */
  onBack?: () => void
  /** Есть только в tablet: кнопка «Закрыть» снимает выбор задачи. */
  onClose?: () => void
  /** Сообщение об ошибке последнего действия. */
  message?: string | null
  maxBytes?: number
  maxFiles?: number
  isTypeAllowed?: AttachmentListProps['isTypeAllowed']
  canDeleteAttachment?: AttachmentListProps['canDelete']
}

const iconButton =
  'flex size-8 shrink-0 items-center justify-center rounded-full text-ink-60 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-start gap-3 py-1.5">
      <dt className="w-[104px] shrink-0 pt-1 text-[13px] text-ink-60">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</dd>
    </div>
  )
}

function Person({ user }: { user: TaskDetailsData['creator'] | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <UserAvatar login={user?.login ?? null} size="sm" />
      <span className={cn('truncate text-[13px] font-medium', user ? 'text-ink' : 'text-ink-40')}>{loginOf(user)}</span>
    </span>
  )
}

const visible = (user: { id: string; login: string | null }): UserSummary[] =>
  user.login === null ? [] : [{ id: user.id, login: user.login }]

function EditableTitle({ title, onSave }: { title: string; onSave: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  function commit() {
    setEditing(false)
    const next = draft.trim()
    if (next !== '' && next !== title) onSave(next)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        aria-label="Название"
        value={draft}
        maxLength={TITLE_MAX}
        className="h-11 text-lg font-semibold"
        onChange={(event) => {
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            event.stopPropagation()
            setEditing(false)
          }
        }}
      />
    )
  }
  return (
    <div className="flex items-start gap-1">
      <h2 title={title} className="min-w-0 flex-1 font-display text-[22px] leading-tight font-semibold text-ink [overflow-wrap:anywhere]">
        {title}
      </h2>
      <button
        type="button"
        aria-label="Изменить название"
        onClick={() => {
          setDraft(title)
          setEditing(true)
        }}
        className={iconButton}
      >
        <Pencil size={16} />
      </button>
    </div>
  )
}

function EditableDescription({ text, onSave }: { text: string; onSave: (text: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)

  function commit() {
    setEditing(false)
    if (draft !== text) onSave(draft)
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold tracking-wide text-ink-40 uppercase">Описание</h3>
      {editing ? (
        <Textarea
          autoFocus
          aria-label="Описание"
          value={draft}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setEditing(false)
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label="Изменить описание"
          onClick={() => {
            setDraft(text)
            setEditing(true)
          }}
          className="rounded-2xl bg-surface-alt px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          <span className={cn('block text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]', text === '' ? 'text-ink-40' : 'text-ink-80')}>
            {text === '' ? 'Описание не задано' : text}
          </span>
        </button>
      )}
    </div>
  )
}

export function TaskDetails(props: TaskDetailsProps) {
  const { task, now, me, userSearch } = props
  const mobile = useOptionalLayoutMode() === 'mobile'
  const [confirmOpen, setConfirmOpen] = useState(false)
  const done = task.status === 'done'
  const overdue = isOverdue(task.status, task.deadline, now)
  const assignee = task.assignee ? (visible(task.assignee)[0] ?? null) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 px-3">
        {props.onBack ? (
          <button
            type="button"
            aria-label="Назад"
            onClick={props.onBack}
            className="flex size-10 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <ChevronLeft />
          </button>
        ) : null}
        <span className="min-w-0 flex-1 truncate pl-1 text-base font-semibold text-ink">Задача</span>
        {props.onClose ? (
          <button
            type="button"
            aria-label="Закрыть"
            onClick={props.onClose}
            className="flex size-9 items-center justify-center rounded-full text-ink-80 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <X size={18} />
          </button>
        ) : null}
        {mobile ? (
          <button
            type="button"
            aria-label="Удалить задачу"
            onClick={() => {
              setConfirmOpen(true)
            }}
            className="flex size-10 items-center justify-center rounded-full bg-surface-alt text-brand-red outline-none hover:bg-brand-red-soft focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <Trash2 size={18} />
          </button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pt-2 pb-5">
        {props.message ? (
          <p role="alert" className="rounded-xl bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
            {props.message}
          </p>
        ) : null}

        <EditableTitle key={task.title} title={task.title} onSave={(title) => { props.onPatch({ title }) }} />

        <div className="flex items-center gap-2">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={`Статус: ${STATUS_LABEL[task.status]}`}
                className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
              >
                <StatusBadge status={task.status} className="h-9 px-3.5 text-[13px]" />
                <ChevronDown size={14} className="text-ink-60" />
              </button>
            </MenuTrigger>
            <MenuContent align="start" className="min-w-[200px] rounded-2xl">
              {TASK_STATUSES.map((status) => (
                <MenuItem
                  key={status}
                  onSelect={() => {
                    props.onStatus(status)
                  }}
                >
                  {STATUS_LABEL[status]}
                  {status === task.status ? <Check size={16} className="ml-auto text-brand-red" /> : null}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Button
            variant="secondary"
            className="h-9 gap-1.5 rounded-full px-3.5 text-[13px]"
            onClick={() => {
              props.onStatus(done ? 'todo' : 'done')
            }}
          >
            {done ? null : <Check size={16} className="text-success" />}
            {done ? 'Вернуть в работу' : 'Готово'}
          </Button>
        </div>

        <dl className="flex flex-col">
          <Row label="Ответственный">
            <UserPicker
              label="Ответственный"
              search={userSearch}
              me={me}
              value={assignee}
              onChange={(user) => {
                props.onPatch({ assigneeId: user?.id ?? null })
              }}
            />
          </Row>
          <Row label="Наблюдатели">
            <UserPicker
              multiple
              label="Наблюдатели"
              search={userSearch}
              me={me}
              value={task.watchers.flatMap(visible)}
              onChange={(users) => {
                props.onPatch({ watcherIds: users.map((u) => u.id) })
              }}
            />
          </Row>
          <Row label="Дедлайн">
            <DeadlineField
              label="Дедлайн"
              value={task.deadline}
              now={now}
              className="h-8 rounded-lg"
              onChange={(deadline) => {
                if (deadline !== task.deadline) props.onPatch({ deadline })
              }}
            />
            {task.deadline !== null ? (
              <button type="button" aria-label="Убрать дедлайн" onClick={() => { props.onPatch({ deadline: null }) }} className={iconButton}>
                <X size={14} />
              </button>
            ) : null}
            {overdue ? <span className="text-[13px] font-semibold text-brand-red">Просрочено</span> : null}
          </Row>
          <Row label="Создатель">
            <Person user={task.creator} />
          </Row>
          <Row label="Создана">
            <span className="text-[13px] text-ink-80">{formatFullDateTime(task.createdAt)}</span>
          </Row>
          {done && task.completedAt ? (
            <Row label="Закрыта">
              <span className="text-[13px] text-ink-80">{formatFullDateTime(task.completedAt)}</span>
            </Row>
          ) : null}
        </dl>

        <EditableDescription key={task.description} text={task.description} onSave={(description) => { props.onPatch({ description }) }} />

        <AttachmentList
          attachments={task.attachments}
          onUpload={props.onUpload}
          onDelete={props.onDeleteAttachment}
          onDownload={props.onDownload}
          maxBytes={props.maxBytes}
          maxFiles={props.maxFiles}
          isTypeAllowed={props.isTypeAllowed}
          canDelete={props.canDeleteAttachment}
        />
      </div>

      <footer className="flex h-[62px] shrink-0 items-center px-3 pb-3">
        {mobile ? null : (
          <button
            type="button"
            onClick={() => {
              setConfirmOpen(true)
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-brand-red outline-none hover:bg-brand-red-soft focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <Trash2 size={16} />
            Удалить задачу
          </button>
        )}
        <span className="ml-auto pr-2 text-xs text-ink-40">{`Изменена ${formatRelativeDateTime(task.updatedAt, now)}`}</span>
      </footer>

      {confirmOpen ? (
        <TaskDeleteConfirm
          taskTitle={task.title}
          onCancel={() => {
            setConfirmOpen(false)
          }}
          onConfirm={() => {
            setConfirmOpen(false)
            props.onDelete()
          }}
        />
      ) : null}
    </div>
  )
}
