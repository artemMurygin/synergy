import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { PersonAvatar } from '@/components/ui/person-avatar'
import { cn } from '@/lib/utils'
import type { Employee } from '../model/employees.schema'
import { ROLE_LABEL } from './role-labels'

export interface EmployeeTableProps {
  items: Employee[]
  /** The list is reloading (filter, page): the old rows stay and the list is marked aria-busy */
  busy?: boolean
}

const ROW_GRID = 'md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_110px] md:items-center md:gap-4'

function Empty() {
  return <span className="text-ink-40">—</span>
}

/* Employees Card: header row 11/700 uppercase on surface-alt, rows 68 high, the whole row is a link to the card.
   Below md a row folds into a card: avatar, name and status, "Отдел · Должность", role badges. */
export function EmployeeTable({ items, busy }: EmployeeTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div
        data-testid="employee-table-head"
        aria-hidden="true"
        className={cn(ROW_GRID, 'hidden h-[34px] border-b border-border bg-surface-alt px-5 text-[11px] font-bold uppercase tracking-[0.6px] text-ink-60')}
      >
        <span>Сотрудник</span>
        <span>Отдел</span>
        <span>Должность</span>
        <span>Роли</span>
        <span>Статус</span>
      </div>
      <ul aria-busy={busy ? true : undefined} className="flex flex-col">
        {items.map((employee) => {
          const muted = employee.isActive ? 'text-ink' : 'text-ink-60'
          const secondary = employee.isActive ? 'text-ink-80' : 'text-ink-60'
          return (
            <li key={employee.id} className="border-b border-border last:border-b-0">
              <Link
                to={`/admin/employees/${encodeURIComponent(employee.id)}`}
                aria-label={employee.fullName}
                className={cn(
                  ROW_GRID,
                  'flex flex-col gap-2 px-4 py-4 hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-[68px] md:px-5 md:py-0'
                )}
              >
                <span className="flex items-center gap-3 md:contents">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <PersonAvatar fullName={employee.fullName} className={cn('size-8 md:size-9', !employee.isActive && 'opacity-60')} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn('break-words text-[15px] leading-[18px] font-semibold', muted)}>{employee.fullName}</span>
                      <span className="text-xs leading-[14px] text-ink-60">{employee.login}</span>
                    </span>
                  </span>
                  <span className="md:order-1">
                    <StatusBadge employee={employee} />
                  </span>
                </span>
                <span className="flex flex-wrap gap-x-1 text-[13px] md:contents md:text-sm">
                  <span className={cn('break-words', secondary)}>{employee.department ? employee.department.name : <Empty />}</span>
                  <span aria-hidden="true" className="text-ink-40 md:hidden">
                    ·
                  </span>
                  <span className={cn('break-words', secondary)}>{employee.position ? employee.position : <Empty />}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {employee.roles.length === 0 ? (
                    <Badge tone="neutral">Сотрудник</Badge>
                  ) : (
                    [...employee.roles]
                      .sort((a, b) => (a === 'admin' ? -1 : b === 'admin' ? 1 : 0))
                      .map((role) => (
                        <Badge key={role} tone={role === 'admin' ? 'red' : 'info'}>
                          {ROLE_LABEL[role]}
                        </Badge>
                      ))
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StatusBadge({ employee }: { employee: Employee }) {
  return employee.isActive ? <Badge tone="success">Активен</Badge> : <Badge tone="neutral">Уволен</Badge>
}
