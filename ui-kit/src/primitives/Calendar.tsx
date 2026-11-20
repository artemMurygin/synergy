import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from '../icons'
import { cn } from '../lib/cn'

export type CalendarProps = {
  value: Date | null
  onChange: (date: Date) => void
  today?: Date
  className?: string
}

const LOCALE = 'ru'
const WEEK_DAYS = 7
const WEEKS = 6

const monthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
const dayLabelFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
const weekdayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const addMonths = (d: Date, n: number) => {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last))
}
const mondayIndex = (d: Date) => (d.getDay() + 6) % WEEK_DAYS

const WEEKDAY_LABELS = Array.from({ length: WEEK_DAYS }, (_, i) =>
  upperFirst(weekdayFormat.format(new Date(2024, 0, 1 + i))).replace('.', ''),
)

export function Calendar({ value, onChange, today = new Date(), className }: CalendarProps) {
  const [focused, setFocused] = useState<Date>(value ?? today)
  const [visibleMonth, setVisibleMonth] = useState(() => new Date((value ?? today).getFullYear(), (value ?? today).getMonth(), 1))
  const moveFocus = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const cells = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
    const offset = mondayIndex(first)
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    return Array.from({ length: WEEK_DAYS * WEEKS }, (_, i) => {
      const day = i - offset + 1
      return day >= 1 && day <= daysInMonth ? new Date(first.getFullYear(), first.getMonth(), day) : null
    })
  }, [visibleMonth])

  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }, [focused, visibleMonth])

  const goTo = (date: Date, focus: boolean) => {
    moveFocus.current = focus
    setFocused(date)
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1))
  }

  const shiftMonth = (n: number, focus: boolean) => {
    goTo(addMonths(focused, n), focus)
  }

  const onKeyDown = (e: KeyboardEvent, date: Date) => {
    const week = mondayIndex(date)
    const next: Record<string, Date | undefined> = {
      ArrowLeft: addDays(date, -1),
      ArrowRight: addDays(date, 1),
      ArrowUp: addDays(date, -WEEK_DAYS),
      ArrowDown: addDays(date, WEEK_DAYS),
      Home: addDays(date, -week),
      End: addDays(date, WEEK_DAYS - 1 - week),
      PageUp: addMonths(date, -1),
      PageDown: addMonths(date, 1),
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(date)
      return
    }
    const target = next[e.key]
    if (target) {
      e.preventDefault()
      goTo(target, true)
    }
  }

  const inView = cells.some((c) => c && sameDay(c, focused))
  const tabbable = inView ? focused : cells.find((c) => c) ?? null

  return (
    <div className={cn('flex w-[300px] flex-col gap-2.5 rounded-[18px] bg-surface p-3', className)}>
      <div className="flex items-center pt-0.5 pl-1">
        <span aria-live="polite" className="flex-1 text-[15px] font-semibold text-ink">
          {upperFirst(monthFormat.format(visibleMonth))}
        </span>
        {(
          [
            ['Предыдущий месяц', -1, ChevronLeft],
            ['Следующий месяц', 1, ChevronRight],
          ] as const
        ).map(([label, step, Icon]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={() => {
              shiftMonth(step, false)
            }}
            className="flex size-[30px] items-center justify-center rounded-full text-ink-80 outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <Icon />
          </button>
        ))}
      </div>
      <div ref={gridRef} role="grid" aria-label={upperFirst(monthFormat.format(visibleMonth))} className="flex flex-col gap-0.5">
        <div role="row" className="flex">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} role="columnheader" className="flex h-6 flex-1 items-center justify-center text-[11px] text-ink-40">
              {label}
            </div>
          ))}
        </div>
        {Array.from({ length: WEEKS }, (_, w) => (
          <div key={w} role="row" className="flex">
            {cells.slice(w * WEEK_DAYS, (w + 1) * WEEK_DAYS).map((date, i) => {
              if (!date) return <div key={i} role="gridcell" className="h-[34px] flex-1" />
              const selected = value !== null && sameDay(date, value)
              const isToday = sameDay(date, today)
              return (
                <div key={i} className="flex h-[34px] flex-1 items-center justify-center">
                  <div
                    role="gridcell"
                    tabIndex={tabbable && sameDay(date, tabbable) ? 0 : -1}
                    aria-label={dayLabelFormat.format(date)}
                    aria-selected={selected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => {
                      setFocused(date)
                      onChange(date)
                    }}
                    onKeyDown={(e) => {
                      onKeyDown(e, date)
                    }}
                    className={cn(
                      'flex size-8 cursor-pointer items-center justify-center rounded-full text-[13px] text-ink outline-none select-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40',
                      isToday && 'font-semibold text-brand-red',
                      selected && 'bg-brand-red text-white hover:bg-brand-red-hover',
                    )}
                  >
                    {date.getDate()}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
