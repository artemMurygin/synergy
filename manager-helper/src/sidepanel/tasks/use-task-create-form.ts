import { DESCRIPTION_MAX, EMPTY_TASK_FORM, TITLE_MAX } from '@synergy/ui-kit'
import type { TaskFormErrors, TaskFormValue } from '@synergy/ui-kit'
import { useState } from 'react'
import { TaskUserNotFoundError, createTask } from '@/shared/tasks-api'
import type { CreateTaskInput, UserSummary } from '@/shared/tasks-api'
import { messageOf } from './messages'

export const USER_NOT_FOUND_TEXT = 'Пользователь не найден или отключён'

function toInput(value: TaskFormValue): CreateTaskInput {
  const input: CreateTaskInput = { title: value.title.trim(), assigneeId: value.assignee?.id ?? null }
  if (value.description.trim() !== '') input.description = value.description.trim()
  if (value.deadline !== null) input.deadline = value.deadline
  if (value.watchers.length > 0) input.watcherIds = value.watchers.map((user) => user.id)
  return input
}

/**
 * State and submit of the task creation form, shared by the tablet dialog and the mobile sheet:
 * the assignee is the current user by default, an empty title or a running request blocks the
 * submit, a failure keeps the input.
 */
export function useTaskCreateForm(me: UserSummary, onCreated: () => void) {
  const [value, setValue] = useState<TaskFormValue>({ ...EMPTY_TASK_FORM, assignee: me })
  const [errors, setErrors] = useState<TaskFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const canSubmit = value.title.trim() !== '' && !busy

  const submit = async () => {
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

  return { value, setValue, errors, message, busy, canSubmit, submit }
}
