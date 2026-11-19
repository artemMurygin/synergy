import { useId, useState } from 'react'
import { Eye, EyeOff } from '../icons'
import { cn } from '../lib/cn'
import { FieldError, fieldClass, joinIds, type InputProps } from './Input'

export type PasswordFieldProps = Omit<InputProps, 'type'>

export function PasswordField({
  error,
  className,
  id,
  'aria-describedby': describedBy,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const auto = useId()
  const errorId = `${id ?? auto}-error`
  return (
    <div className="w-full">
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? true : undefined}
          aria-describedby={joinIds(describedBy, error ? errorId : undefined)}
          className={cn(fieldClass, 'h-12 pr-12', className)}
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
          aria-pressed={visible}
          onClick={() => {
            setVisible((v) => !v)
          }}
          className="absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-60 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/30"
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
