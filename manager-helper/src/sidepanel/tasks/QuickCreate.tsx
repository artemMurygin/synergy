import { useState } from 'react'
import { createTask } from '@/shared/tasks-api'
import type { CreateTaskInput, UserSummary } from '@/shared/tasks-api'
import { CalendarIcon } from '../icons'
import { fromLocalInput, messageOf } from './format'
import { UserSearchSelect } from './UserSearchSelect'

interface Props {
  me: UserSummary
  onCreated: () => void
  onCancel: () => void
}

const chip =
  'inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-alt'
const field =
  'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-60'

/** One-field task creation; deadline, assignee and description are revealed on demand. */
export function QuickCreate({ me, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState<string | null>(null)
  const [assignee, setAssignee] = useState<UserSummary>(me)
  const [description, setDescription] = useState<string | null>(null)
  const [showAssignee, setShowAssignee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blank = title.trim() === ''

  const submit = async () => {
    if (blank || busy) return
    const input: CreateTaskInput = { title: title.trim(), assigneeId: assignee.id }
    const due = deadline === null ? null : fromLocalInput(deadline)
    if (due !== null) input.deadline = due
    if (description !== null && description.trim() !== '') input.description = description.trim()
    setBusy(true)
    setError(null)
    try {
      await createTask(input)
    } catch (failure) {
      setError(messageOf(failure))
      setBusy(false)
      return
    }
    setTitle('')
    setDeadline(null)
    setDescription(null)
    setAssignee(me)
    setShowAssignee(false)
    setBusy(false)
    onCreated()
  }

  return (
    <form
      aria-label="Быстрое создание"
      className="flex flex-col gap-2 border-b border-line bg-surface-alt px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <input
        type="text"
        aria-label="Название задачи"
        placeholder="Название задачи"
        autoFocus
        value={title}
        className={field}
        onChange={(event) => {
          setTitle(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          aria-expanded={deadline !== null}
          onClick={() => {
            setDeadline((current) => (current === null ? '' : null))
          }}
        >
          Дедлайн
          <CalendarIcon />
        </button>
        <button
          type="button"
          className={chip}
          aria-expanded={showAssignee}
          onClick={() => {
            setShowAssignee((current) => !current)
          }}
        >
          {assignee.id === me.id ? `Я · ${me.login}` : assignee.login}
        </button>
        <button
          type="button"
          className="text-[13px] font-semibold text-brand-red"
          aria-expanded={description !== null}
          onClick={() => {
            setDescription((current) => (current === null ? '' : null))
          }}
        >
          Ещё
        </button>
      </div>
      {deadline !== null && (
        <label className="flex flex-col gap-1 text-xs text-ink-60">
          Дедлайн
          <input
            type="datetime-local"
            value={deadline}
            className={field}
            onChange={(event) => {
              setDeadline(event.target.value)
            }}
          />
        </label>
      )}
      {showAssignee && (
        <UserSearchSelect
          value={assignee}
          onChange={(user) => {
            setAssignee(user)
            setShowAssignee(false)
          }}
        />
      )}
      {description !== null && (
        <label className="flex flex-col gap-1 text-xs text-ink-60">
          Описание
          <textarea
            rows={3}
            value={description}
            className={field}
            onChange={(event) => {
              setDescription(event.target.value)
            }}
          />
        </label>
      )}
      {error !== null && (
        <p role="alert" className="text-xs break-words text-brand-red">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-60">Enter — создать</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-sunken"
            onClick={onCancel}
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={blank || busy}
            className="rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:bg-ink-40"
          >
            Создать
          </button>
        </div>
      </div>
    </form>
  )
}
