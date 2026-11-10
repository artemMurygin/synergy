import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { BackendError, TaskUserNotFoundError } from '@/lib/backend/errors'
import type { CreateTaskInput } from '@/lib/backend/tasks.api'
import { useCreateTask } from '@/lib/backend/tasks.queries'
import { fieldErrorsFromError } from './field-errors'
import { TaskForm, type TaskFormErrors } from './TaskForm'

export const USER_NOT_FOUND_TEXT = 'Пользователь не найден или отключён'

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Mounted only while the dialog is open, so the form and the mutation state start fresh each time.
function CreateTaskBody({ onClose }: { onClose: () => void }) {
  const create = useCreateTask()
  const [fieldErrors, setFieldErrors] = useState<TaskFormErrors>({})
  const [message, setMessage] = useState<string | null>(null)

  const submit = (input: CreateTaskInput) => {
    setFieldErrors({})
    setMessage(null)
    create.mutate(input, {
      onSuccess: onClose,
      onError: (error) => {
        let found: TaskFormErrors | null
        if (error instanceof TaskUserNotFoundError) {
          setFieldErrors({ participants: USER_NOT_FOUND_TEXT })
        } else if ((found = fieldErrorsFromError(error))) {
          setFieldErrors(found)
        } else {
          setMessage(error instanceof BackendError ? error.message : 'Не удалось создать задачу')
        }
      }
    })
  }

  return (
    <>
      {message && (
        <p role="alert" className="mx-6 mb-3 rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
          {message} Введённые данные сохранены.
        </p>
      )}
      <TaskForm onSubmit={submit} onCancel={onClose} submitting={create.isPending} fieldErrors={fieldErrors} />
    </>
  )
}

export function CreateTaskDialog({ open, onOpenChange }: CreateTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="px-6 pt-5 pb-4 pr-16">
          <DialogTitle className="text-xl font-semibold">Новая задача</DialogTitle>
          <DialogDescription className="sr-only">Заполните поля и создайте задачу</DialogDescription>
        </div>
        {open && <CreateTaskBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
