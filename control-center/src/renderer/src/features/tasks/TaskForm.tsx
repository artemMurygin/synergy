import { CalendarDays } from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useSessionStore } from '@/features/auth/session.store'
import type { CreateTaskInput } from '@/lib/backend/tasks.api'
import type { UserSummary } from '@/lib/backend/tasks.schema'
import { cn } from '@/lib/utils'
import { UserPicker, WATCHERS_LIMIT } from './UserPicker'

export const TITLE_MAX = 200
export const DESCRIPTION_MAX = 10000

export interface TaskFormErrors {
  title?: string
  description?: string
  deadline?: string
  assignee?: string
  watchers?: string
  /** A participant is unknown to the server: shown at the assignee, or at the watchers if none is chosen. */
  participants?: string
}

export interface TaskFormInitial {
  title?: string
  description?: string
  /** ISO timestamp. */
  deadline?: string | null
  assignee?: UserSummary | null
  watchers?: UserSummary[]
}

export interface TaskFormProps {
  initial?: TaskFormInitial
  onSubmit: (input: CreateTaskInput) => void
  onCancel: () => void
  submitting: boolean
  fieldErrors: TaskFormErrors
  submitLabel?: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO timestamp to the local `yyyy-mm-ddThh:mm` that a datetime-local input expects. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface FieldProps {
  label: ReactNode
  htmlFor?: string
  labelId?: string
  error?: string
  errorId: string
  children: ReactNode
  extra?: ReactNode
}

function Field({ label, htmlFor, labelId, error, errorId, children, extra }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold leading-[15px] text-ink">
          {label}
        </label>
      ) : (
        <span id={labelId} className="text-[13px] font-semibold leading-[15px] text-ink">
          {label}
        </span>
      )}
      {children}
      {error && (
        <p id={errorId} className="text-xs text-brand-red">
          {error}
        </p>
      )}
      {extra}
    </div>
  )
}

/** Shared create/edit form: title, description, deadline, assignee and watchers. */
export function TaskForm({ initial, onSubmit, onCancel, submitting, fieldErrors, submitLabel = 'Создать задачу' }: TaskFormProps) {
  const me = useSessionStore((s) => s.snapshot.user)
  const ids = { title: useId(), description: useId(), deadline: useId(), assignee: useId(), watchers: useId() }
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [deadline, setDeadline] = useState(toLocalInput(initial?.deadline))
  const [assignee, setAssignee] = useState<UserSummary | null>(initial?.assignee ?? null)
  const [watchers, setWatchers] = useState<UserSummary[]>(initial?.watchers ?? [])

  const [local, setLocal] = useState<TaskFormErrors>({})

  const errors = {
    title: local.title ?? fieldErrors.title,
    description: local.description ?? fieldErrors.description,
    deadline: fieldErrors.deadline,
    assignee: fieldErrors.assignee ?? (assignee ? fieldErrors.participants : undefined),
    watchers: fieldErrors.watchers ?? (assignee ? undefined : fieldErrors.participants)
  }
  const errorId = (name: keyof typeof ids) => `${ids[name]}-error`
  const fieldProps = (name: keyof typeof ids) => ({
    'aria-invalid': errors[name as keyof typeof errors] ? (true as const) : undefined,
    'aria-describedby': errors[name as keyof typeof errors] ? errorId(name) : undefined
  })

  const canSubmit = title.trim() !== '' && !submitting

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const found: TaskFormErrors = {}
    if (title.trim().length > TITLE_MAX) found.title = `Название не длиннее ${String(TITLE_MAX)} символов`
    if (description.trim().length > DESCRIPTION_MAX) found.description = `Описание не длиннее ${String(DESCRIPTION_MAX)} символов`
    setLocal(found)
    if (Object.keys(found).length > 0) return
    const input: CreateTaskInput = { title: title.trim() }
    if (description.trim() !== '') input.description = description.trim()
    const parsed = deadline ? new Date(deadline) : null
    if (parsed && !Number.isNaN(parsed.getTime())) input.deadline = parsed.toISOString()
    if (assignee) input.assigneeId = assignee.id
    if (watchers.length > 0) input.watcherIds = watchers.map((w) => w.id)
    onSubmit(input)
  }

  const invalidClass = 'border-brand-red'

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 pb-2">
        <Field label="Название *" htmlFor={ids.title} error={errors.title} errorId={errorId('title')}>
          <Input
            id={ids.title}
            placeholder="Что нужно сделать"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={cn('h-12 rounded-md border-border-strong', errors.title && invalidClass)}
            {...fieldProps('title')}
          />
        </Field>
        <Field label="Описание" htmlFor={ids.description} error={errors.description} errorId={errorId('description')}>
          <Textarea
            id={ids.description}
            placeholder="Подробности, ссылки, контекст"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className={cn('border-border-strong', errors.description && invalidClass)}
            {...fieldProps('description')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Дедлайн" htmlFor={ids.deadline} error={errors.deadline} errorId={errorId('deadline')}>
            <div className="relative">
              <CalendarDays aria-hidden className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-ink-60" />
              <Input
                id={ids.deadline}
                type="datetime-local"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className={cn('h-12 rounded-md border-border-strong pl-10', errors.deadline && invalidClass)}
                {...fieldProps('deadline')}
              />
            </div>
          </Field>
          <Field
            label="Ответственный"
            labelId={`${ids.assignee}-label`}
            error={errors.assignee}
            errorId={errorId('assignee')}
            extra={
              me && assignee?.id !== me.id ? (
                <button
                  type="button"
                  onClick={() => setAssignee({ id: me.id, login: me.login })}
                  className="self-start rounded text-xs font-semibold text-brand-red outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Назначить на себя
                </button>
              ) : null
            }
          >
            <UserPicker
              id={ids.assignee}
              label="Ответственный"
              labelledBy={`${ids.assignee}-label`}
              value={assignee}
              onChange={setAssignee}
              invalid={Boolean(errors.assignee)}
              describedBy={errors.assignee ? errorId('assignee') : undefined}
            />
          </Field>
        </div>
        <Field label="Наблюдатели" labelId={`${ids.watchers}-label`} error={errors.watchers} errorId={errorId('watchers')}>
          <UserPicker
            multiple
            id={ids.watchers}
            label="Наблюдатели"
            labelledBy={`${ids.watchers}-label`}
            itemsLabel="наблюдателей"
            max={WATCHERS_LIMIT}
            value={watchers}
            onChange={setWatchers}
            invalid={Boolean(errors.watchers)}
            describedBy={errors.watchers ? errorId('watchers') : undefined}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-3 px-6 py-5">
        <Button type="button" variant="outline" className="h-11 rounded-full px-6" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="submit" className="h-11 rounded-full px-6" disabled={!canSubmit} aria-busy={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
