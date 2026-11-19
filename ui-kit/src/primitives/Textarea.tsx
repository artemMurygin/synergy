import { useId, type ComponentProps } from 'react'
import { cn } from '../lib/cn'
import { FieldError, fieldClass, joinIds, type FieldErrorProps } from './Input'

export type TextareaProps = ComponentProps<'textarea'> & FieldErrorProps

export function Textarea({
  error,
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: TextareaProps) {
  const auto = useId()
  const errorId = `${id ?? auto}-error`
  return (
    <div className="w-full">
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={joinIds(describedBy, error ? errorId : undefined)}
        className={cn(fieldClass, 'min-h-24 resize-y py-3', className)}
        {...props}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
