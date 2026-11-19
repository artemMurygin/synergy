import { useId, type ReactNode } from 'react'
import { Input } from '../primitives/Input'
import { Textarea } from '../primitives/Textarea'
import { fromLocalInput, toLocalInput } from './deadline'
import type { UserSummary } from './types'
import { UserPicker, type UserSearchProps } from './UserPicker'

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 10000

export type TaskFormValue = {
  title: string
  description: string
  /** ISO. */
  deadline: string | null
  assignee: UserSummary | null
  watchers: UserSummary[]
}

export type TaskFormErrors = {
  title?: string
  description?: string
  deadline?: string
  assignee?: string
  watchers?: string
}

export const EMPTY_TASK_FORM: TaskFormValue = { title: '', description: '', deadline: null, assignee: null, watchers: [] }

export type TaskFormFieldsProps = {
  value: TaskFormValue
  onChange: (value: TaskFormValue) => void
  errors?: TaskFormErrors
  userSearch: UserSearchProps
  me?: UserSummary
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-semibold text-ink">{label}</span>
      )}
      {children}
      {error ? <p className="text-xs text-brand-red">{error}</p> : null}
    </div>
  )
}

/** Поля формы создания задачи; те же компоненты в Dialog (CC) и Sheet (MH). */
export function TaskFormFields({ value, onChange, errors = {}, userSearch, me }: TaskFormFieldsProps) {
  const id = useId()
  const set = (patch: Partial<TaskFormValue>) => {
    onChange({ ...value, ...patch })
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label="Название" htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          value={value.title}
          maxLength={TITLE_MAX}
          error={errors.title}
          className="h-11"
          onChange={(event) => {
            set({ title: event.target.value })
          }}
        />
      </Field>
      <Field label="Описание" htmlFor={`${id}-description`}>
        <Textarea
          id={`${id}-description`}
          value={value.description}
          maxLength={DESCRIPTION_MAX}
          error={errors.description}
          onChange={(event) => {
            set({ description: event.target.value })
          }}
        />
      </Field>
      <Field label="Дедлайн" htmlFor={`${id}-deadline`}>
        <Input
          id={`${id}-deadline`}
          type="datetime-local"
          value={toLocalInput(value.deadline)}
          error={errors.deadline}
          className="h-11"
          onChange={(event) => {
            set({ deadline: fromLocalInput(event.target.value) })
          }}
        />
      </Field>
      <Field label="Ответственный" error={errors.assignee}>
        <UserPicker
          label="Ответственный"
          search={userSearch}
          me={me}
          value={value.assignee}
          onChange={(assignee) => {
            set({ assignee })
          }}
        />
      </Field>
      <Field label="Наблюдатели" error={errors.watchers}>
        <UserPicker
          multiple
          label="Наблюдатели"
          search={userSearch}
          me={me}
          value={value.watchers}
          onChange={(watchers) => {
            set({ watchers })
          }}
        />
      </Field>
    </div>
  )
}
