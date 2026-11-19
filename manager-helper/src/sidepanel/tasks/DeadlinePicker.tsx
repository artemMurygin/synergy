import { useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarClock, CalendarDays, CalendarX, Check, ChevronRight, Sun, Sunrise } from '@synergy/ui-kit/icons'
import { formatDeadline, fromLocalInput, quickDeadlines } from './format'

interface Props {
  /** `datetime-local` value; '' means no deadline. */
  value: string
  onChange: (value: string) => void
  now: Date
}

interface Option {
  label: string
  hint: string
  value: string
  icon: ReactNode
}

function timeOf(value: string): string {
  return value.slice(11, 16)
}

/** Second level of the create sheet: quick deadlines, "no deadline" and a custom date. */
export function DeadlinePicker({ value, onChange, now }: Props) {
  const quick = quickDeadlines(now)
  const mondayIso = fromLocalInput(quick.nextMonday)
  const options: Option[] = [
    { label: 'Сегодня', hint: timeOf(quick.today), value: quick.today, icon: <Sun /> },
    { label: 'Завтра', hint: timeOf(quick.tomorrow), value: quick.tomorrow, icon: <Sunrise /> },
    {
      label: 'Следующий понедельник',
      hint: mondayIso === null ? '' : formatDeadline(mondayIso),
      value: quick.nextMonday,
      icon: <CalendarDays />,
    },
    { label: 'Без срока', hint: '', value: '', icon: <CalendarX /> },
  ]
  const custom = !options.some((option) => option.value === value)
  const [customOpen, setCustomOpen] = useState(custom)

  return (
    <div role="radiogroup" aria-label="Дедлайн" className="flex flex-col">
      {options.map((option) => {
        const checked = option.value === value
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={checked}
            className="flex h-13 shrink-0 items-center gap-3 border-b border-[#e8e8ea] px-4 text-left hover:bg-surface-alt"
            onClick={() => {
              setCustomOpen(false)
              onChange(option.value)
            }}
          >
            <span className={checked ? 'text-brand-red' : 'text-ink-40'}>{option.icon}</span>
            <span
              className={`min-w-0 flex-1 truncate text-sm text-ink ${checked ? 'font-semibold' : 'font-medium'}`}
            >
              {option.label}
            </span>
            {option.hint !== '' && (
              <span className="shrink-0 text-xs text-ink-60">{option.hint}</span>
            )}
            {checked && (
              <span className="shrink-0 text-brand-red">
                <Check size={18} />
              </span>
            )}
          </button>
        )
      })}
      <button
        type="button"
        role="radio"
        aria-checked={custom}
        aria-expanded={customOpen}
        className="flex h-13 shrink-0 items-center gap-3 px-4 text-left hover:bg-surface-alt"
        onClick={() => {
          setCustomOpen(true)
        }}
      >
        <span className={custom ? 'text-brand-red' : 'text-ink-40'}>
          <CalendarClock />
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm text-ink ${custom ? 'font-semibold' : 'font-medium'}`}
        >
          Выбрать дату и время
        </span>
        <span className="shrink-0 text-ink-40">
          <ChevronRight />
        </span>
      </button>
      {customOpen && (
        <div className="px-4 pb-2">
          <input
            type="datetime-local"
            aria-label="Дата и время"
            autoFocus
            value={custom ? value : ''}
            className="w-full rounded-xl border border-field-line bg-surface px-4 py-2.5 text-[15px] text-ink outline-none focus:border-brand-red"
            onChange={(event) => {
              onChange(event.target.value)
            }}
          />
        </div>
      )}
    </div>
  )
}
