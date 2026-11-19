import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  EMPTY_TASK_FORM,
  TaskFormFields,
  DESCRIPTION_MAX,
  TITLE_MAX,
  type TaskFormErrors,
  type TaskFormValue
} from '@synergy/ui-kit'
import { useId, useRef, useState, type SyntheticEvent } from 'react'
import { useSessionStore } from '@/features/auth/session.store'
import { BackendError, TaskUserNotFoundError } from '@/lib/backend/errors'
import type { CreateTaskInput } from '@/lib/backend/tasks.api'
import { useCreateTask } from '@/lib/backend/tasks.queries'
import { fieldErrorsFromError } from './field-errors'
import { useUserSearch } from './use-user-search'

export const USER_NOT_FOUND_TEXT = 'Пользователь не найден или отключён'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toInput(value: TaskFormValue): CreateTaskInput {
  const input: CreateTaskInput = { title: value.title.trim() }
  if (value.description.trim() !== '') input.description = value.description.trim()
  if (value.deadline !== null) input.deadline = value.deadline
  if (value.assignee) input.assigneeId = value.assignee.id
  if (value.watchers.length > 0) input.watcherIds = value.watchers.map((w) => w.id)
  return input
}

// Mounted only while the dialog is open, so the form and the mutation state start fresh each time.
function CreateTaskContent({ onClose }: { onClose: () => void }) {
  const formId = useId()
  // the dialog is opened by a button of the page, not by a trigger: focus goes back to that button
  const opener = useRef(document.activeElement)
  const me = useSessionStore((s) => s.snapshot.user)
  const userSearch = useUserSearch()
  const create = useCreateTask()
  const [value, setValue] = useState<TaskFormValue>(EMPTY_TASK_FORM)
  const [errors, setErrors] = useState<TaskFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)

  const canSubmit = value.title.trim() !== '' && !create.isPending

  const submit = (event: SyntheticEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const local: TaskFormErrors = {}
    if (value.title.trim().length > TITLE_MAX) local.title = `Название не длиннее ${String(TITLE_MAX)} символов`
    if (value.description.trim().length > DESCRIPTION_MAX) {
      local.description = `Описание не длиннее ${String(DESCRIPTION_MAX)} символов`
    }
    setErrors(local)
    setMessage(null)
    if (Object.keys(local).length > 0) return
    create.mutate(toInput(value), {
      onSuccess: onClose,
      onError: (error) => {
        const found = fieldErrorsFromError(error)
        if (error instanceof TaskUserNotFoundError) {
          // shown at the assignee, or at the watchers if none is chosen
          setErrors(value.assignee ? { assignee: USER_NOT_FOUND_TEXT } : { watchers: USER_NOT_FOUND_TEXT })
        } else if (found) {
          setErrors(found)
        } else {
          setMessage(error instanceof BackendError ? error.message : 'Не удалось создать задачу')
        }
      }
    })
  }

  return (
    <DialogContent
      title="Новая задача"
      className="max-w-[560px]"
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (opener.current instanceof HTMLElement) opener.current.focus()
      }}
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Отмена
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={!canSubmit} aria-busy={create.isPending}>
            Создать задачу
          </Button>
        </>
      }
    >
      {message && (
        <p role="alert" className="rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
          {message} Введённые данные сохранены.
        </p>
      )}
      <form id={formId} noValidate onSubmit={submit}>
        <TaskFormFields
          value={value}
          onChange={setValue}
          errors={errors}
          userSearch={userSearch}
          me={me ? { id: me.id, login: me.login } : undefined}
        />
      </form>
    </DialogContent>
  )
}

/** Dialog with the form of a new task (fields of the package). */
export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <CreateTaskContent
          onClose={() => {
            onOpenChange(false)
          }}
        />
      )}
    </Dialog>
  )
}
