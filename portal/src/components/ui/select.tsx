import * as React from 'react'
import { cn } from '@/lib/utils'
import { controlClass, FormField, useFieldIds, type FieldProps } from './form-field'

/* lucide chevron-down, ink-60 (#7E7F81), as in Field / Master "Icon Trailing". It is an inline style: a data-URI
   inside a Tailwind arbitrary class is not picked up by the scanner and the arrow was not drawn; position, size and
   repeat are inline too, because tailwind-merge treats bg-[...] as a colour and drops bg-surface. */
export const SELECT_CHEVRON_STYLE: React.CSSProperties = {
  backgroundSize: '18px 18px',
  backgroundPosition: 'right 16px center',
  backgroundRepeat: 'no-repeat',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237E7F81' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
}

/* white surface (controlClass) + chevron 18x18 at the right, 16px from the edge */
export const selectArrowClass = 'appearance-none bg-surface pr-11'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps

export function Select({ label, error, hint, id, className, style, children, ...props }: SelectProps) {
  const ids = useFieldIds(id, { error, hint })
  return (
    <FormField label={label} error={error} hint={hint} {...ids}>
      <select
        id={ids.controlId}
        aria-invalid={ids.invalid}
        aria-describedby={ids.describedBy}
        className={cn(controlClass, 'h-[52px]', selectArrowClass, className)}
        style={{ ...SELECT_CHEVRON_STYLE, ...style }}
        {...props}
      >
        {children}
      </select>
    </FormField>
  )
}
