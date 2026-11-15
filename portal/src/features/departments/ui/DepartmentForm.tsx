import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { Dialog } from '@/components/ui/dialog'
import { FormField, controlClass } from '@/components/ui/form-field'
import { cn } from '@/lib/utils'
import type { DepartmentFormErrors } from '../model/department-errors'
import { DEPARTMENT_NAME_MAX, type Department, type DepartmentInput } from '../model/departments.schema'
import { HeadPicker, type HeadValue } from './HeadPicker'

export interface DepartmentFormProps {
  open: boolean
  /** The department being edited; absent for creation */
  department?: Department
  onSubmit: (input: DepartmentInput) => void
  onClose: () => void
  pending?: boolean
  /** Server answers shown at the fields: 409 on the name, 404 on the head, anything else as a general alert */
  errors?: DepartmentFormErrors
}

function validateName(raw: string): string | null {
  const name = raw.trim()
  if (name === '') return 'Укажите название'
  if (name.length > DEPARTMENT_NAME_MAX) return `Не длиннее ${String(DEPARTMENT_NAME_MAX)} символов`
  return null
}

/* DepartmentDialog: create / edit in a dialog. The body is mounted only while open, so it starts fresh each time and,
   while it stays open after a server error, keeps what was typed and chosen. */
export function DepartmentForm({ open, ...props }: DepartmentFormProps) {
  return open ? <DepartmentFormDialog {...props} /> : null
}

function DepartmentFormDialog({ department, onSubmit, onClose, pending, errors = {} }: Omit<DepartmentFormProps, 'open'>) {
  const uid = useId()
  const formId = `${uid}-form`
  const nameId = `${uid}-name`
  const headId = `${uid}-head`
  const [name, setName] = useState(department?.name ?? '')
  const [head, setHead] = useState<HeadValue | null>(department?.head ?? null)
  const [nameError, setNameError] = useState<string | null>(null)
  const shownNameError = nameError ?? errors.name
  const nameRef = useRef<HTMLInputElement>(null)
  const editing = department !== undefined

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = validateName(name)
    setNameError(problem)
    if (problem) {
      nameRef.current?.focus()
      return
    }
    onSubmit({ name: name.trim(), headUserId: head?.id ?? null })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      compactSheet
      title={editing ? `Отдел ${department.name}` : 'Новый отдел'}
      footer={
        <>
          <Button variant="outline" size="sm" className="h-12 sm:h-11" disabled={pending} onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" form={formId} size="sm" className="h-12 sm:h-11" disabled={pending}>
            {pending ? (editing ? 'Сохраняем…' : 'Создаём…') : editing ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {errors.general ? <Alert tone="error">{errors.general}</Alert> : null}
        <FormField
          label="Название"
          hint="обязательно"
          hintClassName="text-ink-60"
          controlId={nameId}
          hintId={`${nameId}-hint`}
          error={shownNameError}
          errorId={`${nameId}-error`}
        >
          <input
            ref={nameRef}
            id={nameId}
            value={name}
            placeholder="Например, Продажи"
            aria-invalid={shownNameError ? true : undefined}
            aria-describedby={[`${nameId}-hint`, shownNameError ? `${nameId}-error` : null].filter(Boolean).join(' ')}
            onChange={(event) => {
              setName(event.target.value)
              setNameError(null)
            }}
            className={cn(controlClass, 'h-[48px]')}
          />
        </FormField>
        <FormField label="Руководитель" hint="необязательно" hintClassName="text-ink-60" controlId={headId} hintId={`${headId}-hint`} error={errors.head} errorId={`${headId}-error`}>
          <HeadPicker
            id={headId}
            value={head}
            onChange={setHead}
            invalid={Boolean(errors.head)}
            aria-describedby={[`${headId}-hint`, errors.head ? `${headId}-error` : null].filter(Boolean).join(' ')}
          />
        </FormField>
      </form>
    </Dialog>
  )
}
