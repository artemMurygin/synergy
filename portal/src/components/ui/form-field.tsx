import * as React from 'react'
import { cn } from '@/lib/utils'

export interface FieldProps {
  label: string
  error?: string
  hint?: string
  /** Override of the hint colour (default ink-40; the DepartmentDialog frames use ink-60) */
  hintClassName?: string
}

/** Wires a visible label, hint and error text to a control (label, aria-invalid, aria-describedby). */
export function useFieldIds(id: string | undefined, { error, hint }: Pick<FieldProps, 'error' | 'hint'>) {
  const generated = React.useId()
  const controlId = id ?? generated
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return { controlId, hintId, errorId, describedBy, invalid: error ? true : undefined }
}

export function FormField({
  label,
  controlId,
  hint,
  hintClassName,
  hintId,
  error,
  errorId,
  className,
  children
}: FieldProps & {
  controlId: string
  hintId?: string
  errorId?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5">
        <label htmlFor={controlId} className="text-[13px] font-semibold leading-[1.17] text-ink">
          {label}
        </label>
        {hint ? (
          <p id={hintId} className={cn('text-xs leading-[1.17] text-ink-40', hintClassName)}>
            {hint}
          </p>
        ) : null}
      </div>
      {children}
      {error ? (
        <div className="flex items-center gap-1.5 text-brand-red">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <p id={errorId} className="text-xs leading-[1.17]">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  )
}

export const controlClass =
  'w-full rounded-md border border-border-strong bg-surface px-4 font-sans text-[15px] text-ink transition-colors placeholder:text-ink-40 focus-visible:border-ink focus-visible:outline-none focus-visible:ring-[0.5px] focus-visible:ring-ink disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-brand-red'
