import * as React from 'react'
import { cn } from '@/lib/utils'
import { controlClass, FormField, useFieldIds, type FieldProps } from './form-field'

/* lucide chevron-down, ink-60 (#7E7F81), as in Field / Master "Icon Trailing" */
const CHEVRON =
  "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237E7F81' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]"

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps

export function Select({ label, error, hint, id, className, children, ...props }: SelectProps) {
  const ids = useFieldIds(id, { error, hint })
  return (
    <FormField label={label} error={error} hint={hint} {...ids}>
      <select
        id={ids.controlId}
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        className={cn(controlClass, 'h-[52px] appearance-none bg-[length:18px_18px] bg-[right_16px_center] bg-no-repeat pr-11', CHEVRON, className)}
        {...props}
      >
        {children}
      </select>
    </FormField>
  )
}
