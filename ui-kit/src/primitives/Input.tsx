import { useId, type ComponentProps } from 'react'
import { cn } from '../lib/cn'

export const fieldClass =
  'w-full rounded-xl border border-transparent bg-surface-alt px-[18px] text-[15px] text-ink outline-none placeholder:text-ink-40 focus:border-border-strong focus-visible:ring-2 focus-visible:ring-brand-red/30 disabled:opacity-50 aria-invalid:border-brand-red'

export type FieldErrorProps = { error?: string }

export function joinIds(...ids: Array<string | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="mt-1.5 text-xs text-brand-red">
      {children}
    </p>
  )
}

export type InputProps = ComponentProps<'input'> & FieldErrorProps

export function Input({ error, className, id, 'aria-describedby': describedBy, ...props }: InputProps) {
  const auto = useId()
  const errorId = `${id ?? auto}-error`
  return (
    <div className="w-full">
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={joinIds(describedBy, error ? errorId : undefined)}
        className={cn(fieldClass, 'h-12', className)}
        {...props}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
