import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Department } from '../model/departments.schema'

function employeesWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${String(count)} сотрудников`
  if (last === 1) return `${String(count)} сотрудник`
  if (last >= 2 && last <= 4) return `${String(count)} сотрудника`
  return `${String(count)} сотрудников`
}

const TrashIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </svg>
)

export interface DeleteDepartmentDialogProps {
  open: boolean
  department: Department
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}

/* ConfirmDialog · Удалить отдел. The button stays available for a non-empty department (the count may be stale);
   the text then adds how many employees are there now. */
export function DeleteDepartmentDialog({ open, department, onConfirm, onCancel, pending }: DeleteDepartmentDialogProps) {
  const base = 'Отдел исчезнет из справочника. Удалить можно только отдел без сотрудников'
  const description =
    department.employeeCount > 0
      ? `${base}. Сейчас в отделе ${employeesWord(department.employeeCount)} — сначала переведите их в другой отдел`
      : base
  return (
    <ConfirmDialog
      open={open}
      title={`Удалить отдел «${department.name}»?`}
      description={description}
      confirmLabel="Удалить"
      icon={<TrashIcon />}
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
