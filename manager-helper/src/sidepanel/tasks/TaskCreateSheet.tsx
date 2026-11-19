import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createTask } from '@/shared/tasks-api'
import type { CreateTaskInput, UserSummary } from '@/shared/tasks-api'
import { ArrowLeft, Calendar, ChevronRight, CircleAlert, Loader, User, Users, X } from '@synergy/ui-kit/icons'
import { layoutModeForWidth, useViewportWidth } from '@synergy/ui-kit'
import { DeadlinePicker } from './DeadlinePicker'
import { formatLocalDeadline, fromLocalInput, messageOf } from './format'
import { UserSearchSelect } from './UserSearchSelect'

interface Props {
  me: UserSummary
  onCreated: () => void
  onCancel: () => void
}

type Level = 'main' | 'deadline' | 'assignee' | 'watchers'

const TITLES: Record<Exclude<Level, 'main'>, string> = {
  deadline: 'Дедлайн',
  assignee: 'Исполнитель',
  watchers: 'Наблюдатели',
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled])'

const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

function SheetHeader(props: {
  title: string
  wide: boolean
  onBack?: () => void
  onClose: () => void
}) {
  const square = 'flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-surface-alt'
  return (
    <div
      className={`flex shrink-0 items-center gap-2 pr-3 ${props.wide ? 'h-14 pl-6' : 'h-11 pl-4'}`}
    >
      {props.onBack && (
        <button
          type="button"
          aria-label="Назад"
          className={`${square} text-ink`}
          onClick={props.onBack}
        >
          <ArrowLeft />
        </button>
      )}
      <h2
        className={`min-w-0 flex-1 truncate font-heading font-semibold text-ink ${
          props.wide ? 'text-lg' : 'text-base'
        }`}
      >
        {props.title}
      </h2>
      <button
        type="button"
        aria-label="Закрыть"
        className={`${square} text-ink-60`}
        onClick={props.onClose}
      >
        <X size={18} />
      </button>
    </div>
  )
}

function FieldRow(props: {
  icon: ReactNode
  label: string
  value: string
  empty: boolean
  wide: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={`flex w-full shrink-0 items-center gap-3 border-b border-[#e8e8ea] text-left hover:bg-surface-alt ${
        props.wide ? 'h-11 px-6' : 'h-12 px-4'
      }`}
      onClick={props.onClick}
    >
      <span className="shrink-0 text-ink-40">{props.icon}</span>
      <span className="shrink-0 text-sm font-medium text-ink">{props.label}</span>
      <span
        className={`min-w-0 flex-1 truncate text-right text-sm font-semibold ${
          props.empty ? 'text-ink-40' : 'text-ink'
        }`}
      >
        {props.value}
      </span>
      <span className="shrink-0 text-ink-40">
        <ChevronRight />
      </span>
    </button>
  )
}

/**
 * Task creation as a layer over the tasks section: a bottom sheet in a narrow panel and a centered
 * dialog in a wide one. Deadline, assignee and watchers are picked on a second level of the sheet.
 */
export function TaskCreateSheet({ me, onCreated, onCancel }: Props) {
  const wide = layoutModeForWidth(useViewportWidth()) !== 'mobile'
  const dialog = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState<Level>('main')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [assignee, setAssignee] = useState<UserSummary>(me)
  const [watchers, setWatchers] = useState<UserSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blank = title.trim() === ''

  const submit = async () => {
    if (blank || busy) return
    const input: CreateTaskInput = { title: title.trim(), assigneeId: assignee.id }
    const due = fromLocalInput(deadline)
    if (due !== null) input.deadline = due
    if (description.trim() !== '') input.description = description.trim()
    if (watchers.length > 0) input.watcherIds = watchers.map((user) => user.id)
    setBusy(true)
    setError(null)
    try {
      await createTask(input)
    } catch (failure) {
      setError(messageOf(failure))
      setBusy(false)
      return
    }
    setBusy(false)
    onCreated()
  }

  // Esc goes back from the second level and closes the sheet from the first one.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (level === 'main') onCancel()
      else setLevel('main')
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [level, onCancel])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && level === 'main') {
      event.preventDefault()
      void submit()
      return
    }
    if (event.key !== 'Tab' || dialog.current === null) return
    // Focus trap: Tab cycles inside the sheet.
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = items[0]
    const last = items.at(-1)
    if (first === undefined || last === undefined) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const toggleWatcher = (user: UserSummary) => {
    setWatchers((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    )
  }

  const back = () => {
    setLevel('main')
  }

  const hint = blank
    ? 'Введите название, чтобы создать задачу'
    : error !== null
      ? 'Текст сохранён — попробуйте ещё раз'
      : `${MOD_KEY} + Enter — создать · Esc — закрыть`

  const primary = (label: ReactNode, props: { disabled?: boolean; onClick: () => void }) => (
    <button
      type="button"
      disabled={props.disabled}
      className={`flex items-center justify-center gap-2 rounded-xl bg-brand-red font-semibold text-white shadow-[0_6px_12px_#66000033] hover:bg-brand-red-hover disabled:bg-ink-40 disabled:shadow-none ${
        wide ? 'h-9 px-4 text-sm' : 'h-12 w-full text-[15px]'
      }`}
      onClick={props.onClick}
    >
      {label}
    </button>
  )

  const footer = (button: ReactNode, footerHint: string | null) =>
    wide ? (
      <div className="flex shrink-0 items-center gap-2 border-t border-[#e8e8ea] px-6 py-3.5">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-60">{footerHint}</span>
        {level === 'main' && (
          <button
            type="button"
            className="h-9 rounded-xl px-4 text-sm font-semibold text-ink hover:bg-surface-alt"
            onClick={onCancel}
          >
            Отмена
          </button>
        )}
        {button}
      </div>
    ) : (
      <div className="flex shrink-0 flex-col gap-2 px-4 pt-4 pb-5">
        {button}
        {footerHint !== null && <p className="text-center text-xs text-ink-60">{footerHint}</p>}
      </div>
    )

  const done = footer(primary('Готово', { onClick: back }), null)

  let body: ReactNode
  if (level === 'main') {
    body = (
      <>
        <div className={`flex shrink-0 flex-col gap-1 pb-3 ${wide ? 'px-6' : 'px-4'}`}>
          <input
            type="text"
            aria-label="Название задачи"
            placeholder="Название задачи"
            autoFocus
            value={title}
            className="w-full bg-transparent font-heading text-lg font-semibold text-ink outline-none placeholder:text-ink-40"
            onChange={(event) => {
              setTitle(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <textarea
            rows={2}
            aria-label="Описание"
            placeholder="Добавить описание…"
            value={description}
            className="w-full resize-none bg-transparent text-sm text-ink-80 outline-none placeholder:text-ink-40"
            onChange={(event) => {
              setDescription(event.target.value)
            }}
          />
        </div>
        <div className="flex shrink-0 flex-col border-t border-[#e8e8ea]">
          <FieldRow
            icon={<Calendar size={18} />}
            label="Дедлайн"
            value={deadline === '' ? 'Не указан' : formatLocalDeadline(deadline, new Date())}
            empty={deadline === ''}
            wide={wide}
            onClick={() => {
              setLevel('deadline')
            }}
          />
          <FieldRow
            icon={<User />}
            label="Исполнитель"
            value={assignee.id === me.id ? `Я · ${me.login}` : assignee.login}
            empty={false}
            wide={wide}
            onClick={() => {
              setLevel('assignee')
            }}
          />
          <FieldRow
            icon={<Users />}
            label="Наблюдатели"
            value={
              watchers.length === 0 ? 'Добавить' : watchers.map((user) => user.login).join(', ')
            }
            empty={watchers.length === 0}
            wide={wide}
            onClick={() => {
              setLevel('watchers')
            }}
          />
        </div>
        {error !== null && (
          <div
            role="alert"
            className={`flex shrink-0 items-start gap-2 border-t border-[#e8e8ea] bg-brand-red-soft py-2.5 ${
              wide ? 'px-6' : 'px-4'
            }`}
          >
            <span className="mt-px shrink-0 text-brand-red">
              <CircleAlert size={16} />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium break-words text-ink">
              {error}
            </span>
          </div>
        )}
        {footer(
          primary(
            busy ? (
              <>
                <span className="animate-spin">
                  <Loader />
                </span>
                Создаём…
              </>
            ) : (
              'Создать задачу'
            ),
            {
              disabled: blank || busy,
              onClick: () => {
                void submit()
              },
            },
          ),
          hint,
        )}
      </>
    )
  } else if (level === 'deadline') {
    body = (
      <>
        <div className="flex min-h-0 flex-col overflow-y-auto border-t border-[#e8e8ea]">
          <DeadlinePicker value={deadline} onChange={setDeadline} now={new Date()} />
        </div>
        {done}
      </>
    )
  } else if (level === 'assignee') {
    body = (
      <div className={`flex min-h-0 flex-col pb-5 ${wide ? 'px-6' : 'px-4'}`}>
        <UserSearchSelect
          autoFocus
          value={assignee}
          onChange={(user) => {
            setAssignee(user)
            back()
          }}
        />
      </div>
    )
  } else {
    body = (
      <>
        <div className={`flex min-h-0 flex-col gap-2 ${wide ? 'px-6' : 'px-4'}`}>
          {watchers.length > 0 && (
            <ul aria-label="Выбранные наблюдатели" className="flex flex-wrap gap-1.5">
              {watchers.map((user) => (
                <li
                  key={user.id}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-1 pr-1.5 pl-3 text-[13px] font-medium text-ink"
                >
                  {user.login}
                  <button
                    type="button"
                    aria-label={`Убрать ${user.login}`}
                    className="flex size-5 items-center justify-center rounded-full text-ink-60 hover:bg-surface"
                    onClick={() => {
                      toggleWatcher(user)
                    }}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <UserSearchSelect
            autoFocus
            label="Наблюдатели"
            value={null}
            selectedIds={watchers.map((user) => user.id)}
            onChange={toggleWatcher}
          />
        </div>
        {done}
      </>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-30 flex bg-ink/45 ${
        wide ? 'items-center justify-center p-4' : 'items-end'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Новая задача"
        className={`flex max-h-full flex-col overflow-hidden bg-surface ${
          wide
            ? 'w-150 max-w-full rounded-2xl shadow-[0_12px_32px_#00000033]'
            : 'w-full rounded-t-2xl shadow-[0_-4px_24px_#00000026]'
        }`}
        onKeyDown={onKeyDown}
      >
        {!wide && (
          <div className="flex shrink-0 justify-center pt-2 pb-1">
            <span className="h-1 w-9 rounded-full bg-[#cacacb]" />
          </div>
        )}
        <SheetHeader
          title={level === 'main' ? 'Новая задача' : TITLES[level]}
          wide={wide}
          onBack={level === 'main' ? undefined : back}
          onClose={onCancel}
        />
        {body}
      </div>
    </div>
  )
}
