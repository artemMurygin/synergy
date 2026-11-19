import {
  Button,
  DESCRIPTION_MAX,
  EMPTY_TASK_FORM,
  Sheet,
  SheetContent,
  TaskFormFields,
  TITLE_MAX,
  useLayoutMode,
} from '@synergy/ui-kit'
import type { TaskFormErrors, TaskFormValue } from '@synergy/ui-kit'
import { useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import { TaskUserNotFoundError, createTask } from '@/shared/tasks-api'
import type { CreateTaskInput, UserSummary } from '@/shared/tasks-api'
import { messageOf } from './messages'
import { useUserSearch } from './use-user-search'

export const USER_NOT_FOUND_TEXT = 'Пользователь не найден или отключён'

interface Props {
  me: UserSummary
  onCreated: () => void
  onCancel: () => void
}

function toInput(value: TaskFormValue): CreateTaskInput {
  const input: CreateTaskInput = { title: value.title.trim(), assigneeId: value.assignee?.id ?? null }
  if (value.description.trim() !== '') input.description = value.description.trim()
  if (value.deadline !== null) input.deadline = value.deadline
  if (value.watchers.length > 0) input.watcherIds = value.watchers.map((user) => user.id)
  return input
}

/**
 * Task creation in a `Sheet`: a bottom sheet in a narrow panel, a side sheet in a wide one. The
 * title is focused first and Enter creates the task; the assignee is the current user by default.
 */
export function TaskCreateSheet({ me, onCreated, onCancel }: Props) {
  const wide = useLayoutMode() !== 'mobile'
  const userSearch = useUserSearch()
  const form = useRef<HTMLFormElement>(null)
  const [value, setValue] = useState<TaskFormValue>({ ...EMPTY_TASK_FORM, assignee: me })
  const [errors, setErrors] = useState<TaskFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canSubmit = value.title.trim() !== '' && !busy

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const local: TaskFormErrors = {}
    if (value.title.trim().length > TITLE_MAX) {
      local.title = `Название не длиннее ${String(TITLE_MAX)} символов`
    }
    if (value.description.trim().length > DESCRIPTION_MAX) {
      local.description = `Описание не длиннее ${String(DESCRIPTION_MAX)} символов`
    }
    setErrors(local)
    setMessage(null)
    if (Object.keys(local).length > 0) return
    setBusy(true)
    try {
      await createTask(toInput(value))
    } catch (failure) {
      setBusy(false)
      if (failure instanceof TaskUserNotFoundError) {
        setErrors(value.assignee ? { assignee: USER_NOT_FOUND_TEXT } : { watchers: USER_NOT_FOUND_TEXT })
      } else {
        setMessage(messageOf(failure))
      }
      return
    }
    setBusy(false)
    onCreated()
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        title="Новая задача"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.current?.querySelector('input')?.focus()
        }}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" form="task-create-form" disabled={!canSubmit} aria-busy={busy}>
              {busy ? 'Создаём…' : 'Создать задачу'}
            </Button>
          </>
        }
      >
        {message !== null && (
          <p role="alert" className="rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
            {message} Введённые данные сохранены.
          </p>
        )}
        <form ref={form} id="task-create-form" noValidate onSubmit={(event) => void submit(event)}>
          <TaskFormFields value={value} onChange={setValue} errors={errors} userSearch={userSearch} me={me} />
        </form>
      </SheetContent>
    </Sheet>
  )
}
