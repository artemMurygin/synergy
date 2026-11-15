import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Department } from '../model/departments.schema'
import { PersonAvatar } from '@/components/ui/person-avatar'

export interface DepartmentTableProps {
  items: Department[]
  onCreate: () => void
  onEdit: (department: Department) => void
  onDelete: (department: Department) => void
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

const PlusIcon = () => (
  <Icon>
    <path d="M5 12h14M12 5v14" />
  </Icon>
)

const iconButtonClass =
  'inline-flex size-11 items-center justify-center rounded-md text-ink-60 hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-pill bg-brand-red-soft text-brand-red">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" />
        </svg>
      </span>
      <h2 className="font-display text-2xl font-bold text-ink">Отделов пока нет</h2>
      <p className="max-w-[420px] text-sm text-ink-60">Создайте отдел, чтобы указывать его в карточках сотрудников</p>
      <Button onClick={onCreate}>
        <PlusIcon />
        Создать отдел
      </Button>
    </div>
  )
}

/* Departments Card: header row 11/700 uppercase, rows 64 high. At 360 a row folds into a card: name, "Руководитель: …",
   "Сотрудников: N" and the two 44x44 icon buttons in the top right corner. */
export function DepartmentTable({ items, onCreate, onEdit, onDelete }: DepartmentTableProps) {
  if (items.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <EmptyState onCreate={onCreate} />
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <Table className="block md:table">
        <TableHeader className="hidden md:table-header-group">
          <TableRow className="hover:bg-transparent">
            <TableHead className="px-5 py-2.5 md:w-[43%]">Отдел</TableHead>
            <TableHead>Руководитель</TableHead>
            <TableHead className="md:w-[12%]">Сотрудников</TableHead>
            <TableHead className="md:w-[100px]">
              <span className="sr-only">Действия</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="block md:table-row-group">
          {items.map((department) => (
            <TableRow key={department.id} className="relative flex flex-col gap-1 py-3 pr-[104px] pl-4 md:table-row md:px-0 md:py-0">
              <TableCell className="block px-0 pt-1 pb-0 text-[15px] leading-[1.2] font-semibold md:table-cell md:leading-normal md:px-5 md:py-5">{department.name}</TableCell>
              <TableCell className={cn('block px-0 py-0 text-[13px] leading-[1.385] md:table-cell md:px-5 md:py-5 md:text-sm md:leading-normal', headTone(department))}>
                <span className="md:hidden">Руководитель: </span>
                <HeadCell department={department} />
              </TableCell>
              <TableCell className="block px-0 py-0 text-[13px] leading-[1.385] text-ink-60 md:table-cell md:px-5 md:py-5 md:text-sm md:leading-normal md:text-ink">
                <span className="md:hidden">Сотрудников: </span>
                <span>{department.employeeCount}</span>
              </TableCell>
              <TableCell className="absolute top-3 right-2 flex gap-1 px-0 py-0 md:static md:table-cell md:px-5 md:py-2.5">
                <div className="flex justify-end gap-1">
                  <button type="button" className={iconButtonClass} aria-label={`Изменить отдел ${department.name}`} title={`Изменить отдел ${department.name}`} onClick={() => onEdit(department)}>
                    <Icon>
                      <path d="M21.2 5.8a2.1 2.1 0 0 0-3-3L3.6 17.4 2 22l4.6-1.6Z" />
                      <path d="m15 5 4 4" />
                    </Icon>
                  </button>
                  <button type="button" className={iconButtonClass} aria-label={`Удалить отдел ${department.name}`} title={`Удалить отдел ${department.name}`} onClick={() => onDelete(department)}>
                    <Icon>
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                    </Icon>
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function headTone({ head }: Department): string {
  if (!head) return 'text-ink-40'
  return head.isActive ? 'text-ink-80' : 'text-ink-60'
}

function HeadCell({ department }: { department: Department }) {
  const { head } = department
  if (!head) return <span>Не назначен</span>
  /* at 360 the wrapper dissolves, so "Руководитель: ФИО" is one wrapping line */
  return (
    <span className="contents md:inline-flex md:flex-wrap md:items-center md:gap-x-2.5 md:gap-y-1 md:align-middle">
      <PersonAvatar fullName={head.fullName} className="hidden md:inline-flex" />
      <span className={head.isActive ? 'md:text-ink' : 'text-ink-60'}>{head.fullName}</span>
      {head.isActive ? null : (
        <Badge tone="neutral" className="ml-2 md:ml-0">
          Уволен
        </Badge>
      )}
    </span>
  )
}
