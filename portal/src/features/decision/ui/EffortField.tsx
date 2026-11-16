import { controlClass, FormField, useFieldIds } from '@/components/ui/form-field'
import { cn } from '@/lib/utils'

export interface EffortFieldProps {
  value: string
  onChange: (value: string) => void
  error?: string
}

/* lucide timer in ink-40 (#A8A9AC), as the leading icon of Input · Оценка */
const TIMER_ICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A8A9AC' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='10' x2='14' y1='2' y2='2'/%3E%3Cline x1='12' x2='15' y1='14' y2='11'/%3E%3Ccircle cx='12' cy='14' r='8'/%3E%3C/svg%3E")`

/* Field · Оценка: label with the "увидит автор" hint, 52px input with a timer icon, help text below */
export function EffortField({ value, onChange, error }: EffortFieldProps) {
  const ids = useFieldIds(undefined, { error, hint: 'увидит автор' })
  return (
    <div className="flex flex-col gap-2">
      <FormField label="Оценка трудозатрат, ч" hint="увидит автор" hintClassName="text-ink-60" hintEnd error={error} {...ids}>
        <div className="relative">
          <input
            id={ids.controlId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={ids.invalid}
            aria-describedby={ids.describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(controlClass, 'h-[52px] pl-11')}
            style={{ backgroundImage: TIMER_ICON, backgroundPosition: 'left 16px center', backgroundSize: '18px 18px', backgroundRepeat: 'no-repeat' }}
          />
        </div>
      </FormField>
      <p className="font-sans text-xs leading-[1.17] text-ink-60">Целое число часов на разработку по этой заявке</p>
    </div>
  )
}
