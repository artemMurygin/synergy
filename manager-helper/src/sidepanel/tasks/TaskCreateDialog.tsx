import { Button, Dialog, DialogContent, TaskFormFields } from '@synergy/ui-kit'
import { useRef } from 'react'
import type { UserSummary } from '@/shared/tasks-api'
import { useTaskCreateForm } from './use-task-create-form'
import { useUserSearch } from './use-user-search'

interface Props {
  me: UserSummary
  onCreated: () => void
  onCancel: () => void
}

/**
 * Task creation on a tablet: a dialog in the middle of the panel with the full form (m8ddx).
 * The title is focused first, Ctrl + Enter creates the task, the assignee is the current user.
 */
export function TaskCreateDialog({ me, onCreated, onCancel }: Props) {
  const userSearch = useUserSearch()
  const form = useRef<HTMLFormElement>(null)
  const state = useTaskCreateForm(me, onCreated)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <DialogContent
        title="Новая задача"
        className="rounded-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          form.current?.querySelector('input')?.focus()
        }}
        footer={
          <>
            <Button type="button" variant="secondary" className="h-11 rounded-full px-5" onClick={onCancel}>
              Отмена
            </Button>
            <Button
              type="submit"
              form="task-create-form"
              className="h-11 rounded-full px-5"
              disabled={!state.canSubmit}
              aria-busy={state.busy}
            >
              {state.busy ? 'Создаём…' : 'Создать задачу'}
            </Button>
          </>
        }
      >
        {state.message !== null && (
          <p role="alert" className="rounded-md bg-brand-red-soft px-3 py-2 text-[13px] text-brand-red">
            {state.message} Введённые данные сохранены.
          </p>
        )}
        <form
          ref={form}
          id="task-create-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void state.submit()
          }}
        >
          <TaskFormFields
            value={state.value}
            onChange={state.setValue}
            errors={state.errors}
            userSearch={userSearch}
            me={me}
            canSubmit={state.canSubmit}
            onSubmit={() => void state.submit()}
          />
        </form>
      </DialogContent>
    </Dialog>
  )
}
