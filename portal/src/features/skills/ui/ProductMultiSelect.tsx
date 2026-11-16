import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import type { ProductRef } from '@/lib/schemas'

export interface ProductMultiSelectProps {
  products: ProductRef[]
  value: string[]
  onChange: (value: string[]) => void
  error?: string
}

/* Fieldset · Продукты: legend 13/600 with the hint next to it, checkboxes with 32px rows, the error is tied to the group */
export function ProductMultiSelect({ products, value, onChange, error }: ProductMultiSelectProps) {
  const uid = useId()
  const hintId = `${uid}-hint`
  const errorId = `${uid}-error`
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ')

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value.filter((v) => v !== id), id] : value.filter((v) => v !== id))
  }

  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      className="flex min-w-0 flex-col gap-1 border-0 p-0"
    >
      <legend className="mb-1 flex w-full items-center justify-between gap-x-1.5 p-0 font-sans">
        <span className="text-[13px] font-semibold leading-[1.17] text-ink">Продукты</span>
        <span id={hintId} className="text-xs leading-[1.17] text-ink-60">
          хотя бы один
        </span>
      </legend>
      {products.map((product) => (
        <Checkbox
          key={product.id}
          label={product.name}
          checked={value.includes(product.id)}
          onCheckedChange={(checked) => toggle(product.id, checked)}
          className="min-h-8 py-1.5"
        />
      ))}
      {error ? (
        <p id={errorId} className="text-xs leading-[1.17] text-brand-red">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
