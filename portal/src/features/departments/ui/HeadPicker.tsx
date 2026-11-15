import { useEffect, useId, useRef, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { employeeOptionsQuery } from '../model/departments.queries'
import type { DepartmentHead } from '../model/departments.schema'
import { PersonAvatar } from '@/components/ui/person-avatar'

export type HeadValue = DepartmentHead

export interface HeadPickerProps {
  value: HeadValue | null
  onChange: (value: HeadValue | null) => void
  /** id of the trigger, so that a visible label can point at it */
  id?: string
  invalid?: boolean
  'aria-describedby'?: string
}

export const HEAD_SEARCH_DELAY_MS = 300

function Icon({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  )
}

interface Choice {
  key: string
  clear: boolean
  head: HeadValue | null
  label: string
  department?: string
}

/* HeadPicker / Master: a field-like trigger (avatar + name or "Не назначен") and a list below it inside the dialog:
   search field, "Снять руководителя" first when a head is assigned, then up to 10 active employees, the chosen one is checked. */
export function HeadPicker({ value, onChange, id, invalid, 'aria-describedby': describedBy }: HeadPickerProps) {
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), HEAD_SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const options = useQuery({ ...employeeOptionsQuery(term), enabled: open, placeholderData: keepPreviousData })

  const choices: Choice[] = []
  if (value) choices.push({ key: 'clear', clear: true, head: null, label: 'Снять руководителя' })
  for (const employee of options.data ?? []) {
    choices.push({
      key: employee.id,
      clear: false,
      head: { id: employee.id, fullName: employee.fullName, isActive: true },
      label: employee.fullName,
      department: employee.department?.name ?? 'Без отдела'
    })
  }

  function close(focusTrigger: boolean) {
    setOpen(false)
    setSearch('')
    setTerm('')
    setActive(-1)
    if (focusTrigger) triggerRef.current?.focus()
  }

  function pick(choice: Choice) {
    onChange(choice.head)
    close(true)
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, choices.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = choices[active]
      if (choice) pick(choice)
    }
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'ArrowDown' && !open) {
      event.preventDefault()
      setOpen(true)
    }
  }

  const optionId = (index: number) => `${uid}-option-${String(index)}`

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          'flex h-[52px] w-full items-center gap-2.5 rounded-md border bg-surface px-3.5 text-left font-sans text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          invalid ? 'border-brand-red' : 'border-border-strong'
        )}
      >
        {value ? <PersonAvatar fullName={value.fullName} /> : null}
        <span className={cn('min-w-0 flex-1 truncate', value ? 'text-ink' : 'text-ink-40')}>
          {value ? value.fullName : 'Не назначен'}
        </span>
        {value && !value.isActive ? (
          <Badge tone="neutral" className="shrink-0">
            Уволен
          </Badge>
        ) : null}
        <Icon className={cn('size-[18px] shrink-0 text-ink-60 transition-transform', open && 'rotate-180')}>
          <path d="m6 9 6 6 6-6" />
        </Icon>
      </button>

      {open ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
          <div className="border-b border-border p-3">
            <div className="flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3">
              <Icon className="size-[18px] shrink-0 text-ink-40">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </Icon>
              <input
                ref={searchRef}
                type="search"
                aria-label="Найти сотрудника"
                placeholder="Найти сотрудника"
                aria-controls={listboxId}
                aria-activedescendant={active >= 0 ? optionId(active) : undefined}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setActive(-1)
                }}
                onKeyDown={onSearchKeyDown}
                className="min-w-0 flex-1 bg-transparent font-sans text-[15px] text-ink outline-none placeholder:text-ink-40"
              />
            </div>
          </div>
          <ul id={listboxId} role="listbox" aria-label="Руководитель" className="max-h-[260px] overflow-y-auto">
            {choices.map((choice, index) => {
              const selected = !choice.clear && choice.head?.id === value?.id
              return (
                <li
                  key={choice.key}
                  id={optionId(index)}
                  role="option"
                  aria-selected={choice.clear ? undefined : selected}
                  onClick={() => pick(choice)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2 text-[15px]',
                    choice.clear && 'border-b border-border',
                    selected ? 'bg-brand-red-soft' : active === index ? 'bg-surface-alt' : undefined
                  )}
                >
                  {choice.clear ? (
                    <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-60">
                      <Icon className="size-4">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="m17 8 5 5M22 8l-5 5" />
                      </Icon>
                    </span>
                  ) : (
                    <PersonAvatar fullName={choice.label} />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink">{choice.label}</span>
                    {choice.department ? <span className="truncate text-xs text-ink-60">{choice.department}</span> : null}
                  </span>
                  {selected ? (
                    <Icon className="size-4 shrink-0 text-brand-red">
                      <path d="M20 6 9 17l-5-5" />
                    </Icon>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {options.isPending ? <p className="px-4 py-4 text-center text-sm text-ink-60">Загружаем…</p> : null}
          {options.isError ? (
            <div className="flex flex-col items-start gap-3 px-4 py-4">
              <p role="alert" className="flex items-center gap-2 text-sm text-ink">
                <Icon className="size-4 shrink-0 text-brand-red">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </Icon>
                Не удалось загрузить сотрудников
              </p>
              <button
                type="button"
                onClick={() => void options.refetch()}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Повторить
              </button>
            </div>
          ) : null}
          {options.isSuccess && options.data.length === 0 ? <p className="px-4 py-4 text-center text-sm text-ink-60">Никого не нашли</p> : null}
        </div>
      ) : null}
    </div>
  )
}
