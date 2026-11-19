import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export type SegmentOption = { value: string; label: string }

export type SegmentedControlProps = {
  'aria-label': string
  options: SegmentOption[]
  value: string
  onValueChange: (value: string) => void
  trailing?: ReactNode
  className?: string
}

export function SegmentedControl({
  options,
  value,
  onValueChange,
  trailing,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(e: KeyboardEvent, index: number) {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + options.length) % options.length
    const option = options[next]
    if (!option) return
    onValueChange(option.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex items-center gap-0.5 rounded-[18px] bg-surface-alt p-[3px]', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              onValueChange(option.value)
            }}
            onKeyDown={(e) => {
              onKeyDown(e, index)
            }}
            className={cn(
              'h-[30px] rounded-[15px] px-3 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-red/40',
              checked ? 'bg-surface text-ink shadow-[0_1px_3px_var(--color-shadow-card)]' : 'bg-transparent text-ink-60 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
      {trailing}
    </div>
  )
}
