import { useId, useState } from 'react'
import { Calendar as CalendarIcon, Clock } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { cn } from '../lib/cn'
import { Button } from '../primitives/Button'
import { Calendar } from '../primitives/Calendar'
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/Popover'
import { Sheet, SheetContent } from '../primitives/Sheet'
import { formatDeadline, quickDeadline, type QuickDeadlineKind } from './deadline'

const QUICK: [QuickDeadlineKind, string][] = [
  ['today', 'Сегодня'],
  ['tomorrow', 'Завтра'],
  ['week', 'Через неделю'],
]

const pad = (n: number): string => String(n).padStart(2, '0')
const DEFAULT_HOUR = 18

export type DeadlinePickerProps = {
  value: Date | null
  /** Вызывается только по «Готово» (с датой) или «Без срока» (null). */
  onChange: (value: Date | null) => void
  onClose: () => void
  now?: Date
  className?: string
}

/** Выбор дедлайна: быстрые даты, календарь, время, «Без срока», «Готово». Закрытие без «Готово» значение не меняет. */
export function DeadlinePicker({ value, onChange, onClose, now = new Date(), className }: DeadlinePickerProps) {
  const timeId = useId()
  const [draft, setDraft] = useState<Date | null>(value)
  const hours = draft?.getHours() ?? DEFAULT_HOUR
  const minutes = draft?.getMinutes() ?? 0

  const setDay = (day: Date) => {
    setDraft(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes))
  }
  const setTime = (text: string) => {
    const [h, m] = text.split(':').map(Number)
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return
    const base = draft ?? now
    setDraft(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m))
  }

  return (
    <div className={cn('flex w-full flex-col gap-3 bg-surface', className)}>
      <div className="flex flex-wrap gap-2">
        {QUICK.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => {
              setDraft(quickDeadline(kind, now, draft))
            }}
            className="h-[30px] rounded-full bg-surface-alt px-3.5 text-xs font-semibold text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            {label}
          </button>
        ))}
      </div>
      <Calendar value={draft} today={now} onChange={setDay} className="w-full p-0" />
      <div className="flex items-center justify-between">
        <label
          htmlFor={timeId}
          className="flex h-9 items-center gap-2 rounded-full bg-surface-alt px-3.5 text-[13px] font-semibold text-ink focus-within:ring-2 focus-within:ring-brand-red/40"
        >
          <Clock size={15} className="text-ink-60" />
          <input
            id={timeId}
            type="time"
            aria-label="Время"
            value={`${pad(hours)}:${pad(minutes)}`}
            onChange={(event) => {
              setTime(event.target.value)
            }}
            className="bg-transparent outline-none [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            onClose()
          }}
          className="h-9 rounded-full px-3 text-[13px] font-semibold text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          Без срока
        </button>
      </div>
      <Button
        className="h-12 w-full rounded-full"
        onClick={() => {
          if (draft !== null) onChange(draft)
          onClose()
        }}
      >
        {draft ? `Готово · ${formatDeadline(draft.toISOString())}` : 'Готово'}
      </Button>
    </div>
  )
}

export type DeadlineFieldProps = {
  /** ISO. */
  value: string | null
  onChange: (iso: string | null) => void
  label: string
  now?: Date
  className?: string
}

/** Кнопка поля срока: выбор открывается всплывающим окном, на mobile — в Sheet. */
export function DeadlineField({ value, onChange, label, now, className }: DeadlineFieldProps) {
  const mobile = useOptionalLayoutMode() === 'mobile'
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
  }
  const picker = (
    <DeadlinePicker
      key={value ?? 'none'}
      value={value === null ? null : new Date(value)}
      now={now}
      onChange={(date) => {
        onChange(date === null ? null : date.toISOString())
      }}
      onClose={close}
    />
  )
  const trigger = (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex h-11 min-w-0 items-center gap-2 rounded-xl bg-surface-alt px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40',
        className,
      )}
      onClick={mobile ? () => { setOpen(true) } : undefined}
    >
      <CalendarIcon aria-hidden size={16} className="shrink-0 text-ink-40" />
      <span className={cn('truncate', value ? 'font-medium text-ink' : 'text-ink-40')}>
        {value ? formatDeadline(value) : 'Без срока'}
      </span>
    </button>
  )

  if (mobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" title="Дедлайн" className="pb-6">
            {picker}
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[324px] rounded-[18px] p-3">{picker}</PopoverContent>
    </Popover>
  )
}
