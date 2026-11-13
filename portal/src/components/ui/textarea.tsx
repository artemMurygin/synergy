import * as React from 'react'
import { cn } from '@/lib/utils'
import { controlClass, FormField, useFieldIds, type FieldProps } from './form-field'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps

export function Textarea({ label, error, hint, id, className, ...props }: TextareaProps) {
  const ids = useFieldIds(id, { error, hint })
  return (
    <FormField label={label} error={error} hint={hint} {...ids}>
      <textarea
        id={ids.controlId}
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        className={cn(controlClass, 'min-h-[120px] resize-y py-3.5 text-sm leading-[1.45]', className)}
        {...props}
      />
    </FormField>
  )
}
