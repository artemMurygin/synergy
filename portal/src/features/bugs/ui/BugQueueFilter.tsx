import { cn } from '@/lib/utils'
import { BUG_QUEUE_FILTERS } from '../model/bug-presentation'
import type { BugQueueFilterValue } from '../model/bugs.schema'

export interface BugQueueFilterProps {
  value: BugQueueFilterValue
  onChange: (value: BugQueueFilterValue) => void
}

/** Segment switch (`Segment Switch / Master`): a group of toggle buttons, the chosen one has `aria-pressed`. */
export function BugQueueFilter({ value, onChange }: BugQueueFilterProps) {
  return (
    <div
      role="group"
      aria-label="Фильтр по статусу"
      className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-pill bg-surface-sunken p-[3px]"
    >
      {BUG_QUEUE_FILTERS.map((filter) => {
        const pressed = filter.id === value
        return (
          <button
            key={filter.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(filter.id)}
            className={cn(
              'shrink-0 rounded-pill px-4 py-1.5 text-[13px] leading-[15px] font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pressed ? 'bg-surface text-ink' : 'text-ink-60 hover:text-ink'
            )}
          >
            {filter.label}
          </button>
        )
      })}
    </div>
  )
}
