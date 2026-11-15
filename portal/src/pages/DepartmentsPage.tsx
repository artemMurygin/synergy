import { useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  DeleteDepartmentDialog,
  DepartmentForm,
  DepartmentTable,
  departmentDeleteErrorMessage,
  departmentFormErrors,
  useCreateDepartment,
  useDeleteDepartment,
  useUpdateDepartment,
  type Department,
  type DepartmentInput
} from '@/features/departments'
import { ErrorBlock, LoadingBlock, PageHeading, PlusIcon } from './admin-ui'
import { useDepartments } from './use-departments'

type Editing = { mode: 'create' } | { mode: 'edit'; department: Department }
type Notice = { tone: 'success' | 'error'; text: string }
type FocusTarget = { kind: 'create' } | { kind: 'delete'; name: string }

export function DepartmentsPage() {
  const query = useDepartments()
  const create = useCreateDepartment()
  const update = useUpdateDepartment()
  const remove = useDeleteDepartment()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)
  const root = useRef<HTMLElement>(null)
  const items = query.data
  const isEmpty = items !== undefined && items.length === 0
  const saving = editing?.mode === 'edit' ? update : create

  // after a deletion the row is gone or has to be found again: move the focus once the list is on the screen
  useEffect(() => {
    if (!focusTarget || query.isFetching) return
    const buttons = Array.from(root.current?.querySelectorAll('button') ?? [])
    const target =
      focusTarget.kind === 'create'
        ? buttons.find((button) => button.textContent?.trim() === 'Создать отдел')
        : buttons.find((button) => button.getAttribute('aria-label') === `Удалить отдел ${focusTarget.name}`)
    target?.focus()
    setFocusTarget(null)
  }, [focusTarget, query.isFetching, items])

  function submit(input: DepartmentInput) {
    if (!editing) return
    const done = (text: string) => {
      setEditing(null)
      create.reset()
      update.reset()
      setNotice({ tone: 'success', text })
    }
    if (editing.mode === 'edit') update.mutate({ id: editing.department.id, ...input }, { onSuccess: () => done('Изменения сохранены') })
    else create.mutate(input, { onSuccess: () => done('Отдел создан') })
  }

  function confirmDelete(department: Department) {
    remove.mutate(department.id, {
      onSuccess: () => {
        setDeleting(null)
        setNotice({ tone: 'success', text: 'Отдел удалён' })
        setFocusTarget({ kind: 'create' })
      },
      onError: (error) => {
        setDeleting(null)
        setNotice({ tone: 'error', text: departmentDeleteErrorMessage(error, department.name) })
        setFocusTarget({ kind: 'delete', name: department.name })
      }
    })
  }

  function open(next: Editing | null) {
    create.reset()
    update.reset()
    setNotice(null)
    setEditing(next)
  }

  return (
    <section ref={root} className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 min-[768px]:flex-row min-[768px]:items-end min-[768px]:justify-between">
        <PageHeading title="Отделы" caption="Справочник отделов. Отдел и руководитель не влияют на доступы" />
        {isEmpty ? null : (
          <Button className="w-full min-[768px]:w-auto" onClick={() => open({ mode: 'create' })}>
            <PlusIcon />
            Создать отдел
          </Button>
        )}
      </header>
      {notice ? (
        <Alert tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </Alert>
      ) : null}
      {query.isPending ? (
        <LoadingBlock text="Загружаем отделы…" />
      ) : query.isError ? (
        <ErrorBlock title="Не удалось загрузить отделы" message={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <DepartmentTable
          items={query.data}
          onCreate={() => open({ mode: 'create' })}
          onEdit={(department) => open({ mode: 'edit', department })}
          onDelete={(department) => {
            remove.reset()
            setNotice(null)
            setDeleting(department)
          }}
        />
      )}
      <DepartmentForm
        open={editing !== null}
        department={editing?.mode === 'edit' ? editing.department : undefined}
        pending={saving.isPending}
        errors={saving.isError ? departmentFormErrors(saving.error) : undefined}
        onSubmit={submit}
        onClose={() => {
          if (!saving.isPending) open(null)
        }}
      />
      {deleting ? (
        <DeleteDepartmentDialog
          open
          department={deleting}
          pending={remove.isPending}
          onConfirm={() => confirmDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  )
}
