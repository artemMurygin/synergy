import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface CheckboxProps {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  name?: string
  value?: string
  className?: string
}

/* Checkbox / Master: native input type=checkbox inside a label (form, Space, label click come for free); the 20px box with r-sm
   is drawn next to it: brand-red with a white tick when checked, label 14/600 and description 12 ink-60 (aria-describedby) */
export function Checkbox({ label, description, checked, onCheckedChange, disabled, id, name, value, className }: CheckboxProps) {
  const uid = useId()
  const inputId = id ?? uid
  const labelId = `${inputId}-label`
  const descriptionId = `${inputId}-description`
  return (
    <label
      className={cn('flex min-h-11 w-full items-start gap-3 rounded-md py-2.5 text-left font-sans', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', className)}
    >
      <input
        id={inputId}
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-px flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface text-surface peer-checked:border-brand-red peer-checked:bg-brand-red peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 [&>svg]:hidden peer-checked:[&>svg]:block"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span id={labelId} className="text-sm font-semibold text-ink">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-xs leading-[1.4] text-ink-60">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}
