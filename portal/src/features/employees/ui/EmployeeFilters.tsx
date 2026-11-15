import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { controlClass } from '@/components/ui/form-field'
import { SELECT_CHEVRON_STYLE, selectArrowClass } from '@/components/ui/select'
import type { Department } from '@/features/departments'
import { cn } from '@/lib/utils'
import type { EmployeeStatusFilter } from '../model/employees.schema'

export const EMPLOYEE_SEARCH_DELAY_MS = 300
export const EMPLOYEE_SEARCH_MAX = 100

export interface EmployeeFiltersValue {
  search: string
  departmentId?: string | undefined
  status: EmployeeStatusFilter
}

export interface EmployeeFiltersProps {
  value: EmployeeFiltersValue
  onChange: (value: EmployeeFiltersValue) => void
  /** Undefined until the departments are loaded or when they failed to load */
  departments: Department[] | undefined
  departmentsError?: boolean
  onReset: () => void
}

const STATUS_CHIPS: { value: EmployeeStatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'dismissed', label: 'Уволенные' }
]

const chipClass =
  'inline-flex h-11 items-center whitespace-nowrap rounded-pill border px-[17px] font-sans text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

/* Filters card: search 320 with an icon (reported after 300 ms), department select without a visible label,
   status chips, "Сбросить фильтры" only while something is filtered. Below 640 everything is one column. */
export function EmployeeFilters({ value, onChange, departments, departmentsError, onReset }: EmployeeFiltersProps) {
  const hintId = useId()
  const [text, setText] = useState(value.search)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(value)
  latest.current = value

  // the search was changed from outside (reset): follow it, unless the user is typing right now
  useEffect(() => {
    if (timer.current === null) setText(value.search)
  }, [value.search])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    []
  )

  function cancelPending() {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function typed(next: string) {
    setText(next)
    cancelPending()
    timer.current = setTimeout(() => {
      timer.current = null
      onChange({ ...latest.current, search: next })
    }, EMPLOYEE_SEARCH_DELAY_MS)
  }

  function change(patch: Partial<EmployeeFiltersValue>) {
    cancelPending()
    onChange({ ...latest.current, search: text, ...patch })
  }

  const sorted = [...(departments ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const filtered = value.search !== '' || text !== '' || value.departmentId !== undefined || value.status !== 'all'

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3 sm:rounded-lg sm:border sm:border-border sm:bg-surface sm:p-5 min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-start">
      <div className="relative w-full min-[900px]:w-[320px]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          aria-label="Поиск по ФИО, логину или email"
          placeholder="Поиск по ФИО, логину или email"
          maxLength={EMPLOYEE_SEARCH_MAX}
          value={text}
          onChange={(event) => typed(event.target.value)}
          className={cn(controlClass, 'h-12 pl-11 text-sm sm:text-[15px] min-[900px]:h-11')}
        />
      </div>
      <div className="flex w-full flex-col gap-1.5 min-[900px]:w-[220px]">
        <select
          aria-label="Отдел"
          aria-describedby={departmentsError ? hintId : undefined}
          disabled={departmentsError === true || departments === undefined}
          value={value.departmentId ?? ''}
          onChange={(event) => change({ departmentId: event.target.value === '' ? undefined : event.target.value })}
          style={SELECT_CHEVRON_STYLE}
          className={cn(controlClass, 'h-12 min-[900px]:h-11', selectArrowClass)}
        >
          <option value="">Все отделы</option>
          {sorted.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        {departmentsError ? (
          <p id={hintId} className="text-xs text-ink-60">
            Отделы не загрузились
          </p>
        ) : null}
      </div>
      <div role="group" aria-label="Статус" className="flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map((chip) => {
          const active = value.status === chip.value
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => change({ status: chip.value })}
              className={cn(chipClass, active ? 'border-ink bg-ink text-white' : 'border-border-strong bg-surface text-ink hover:bg-surface-alt')}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
      {filtered ? (
        <Button variant="ghost" className="h-11 min-[900px]:ml-auto" onClick={onReset}>
          Сбросить фильтры
        </Button>
      ) : null}
    </div>
  )
}
