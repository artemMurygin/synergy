import * as React from 'react'
import { cn } from '@/lib/utils'
import { controlClass, FormField, useFieldIds, type FieldProps } from './form-field'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldProps

export function Input({ label, error, hint, hintClassName, hintEnd, id, className, ...props }: InputProps) {
  const ids = useFieldIds(id, { error, hint })
  return (
    <FormField label={label} error={error} hint={hint} hintClassName={hintClassName} hintEnd={hintEnd} {...ids}>
      <input
        id={ids.controlId}
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        className={cn(controlClass, 'h-[52px]', className)}
        {...props}
      />
    </FormField>
  )
}
