import type { Section } from '@/shared/active-section'

interface Props {
  section: Section
  onChange: (section: Section) => void
}

const OPTIONS: { value: Section; label: string }[] = [
  { value: 'chat', label: 'Чат' },
  { value: 'tasks', label: 'Задачи' },
]

/** Segmented switch "Чат / Задачи" of the panel header. */
export function SectionSwitch({ section, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Раздел"
      className="flex shrink-0 gap-0.5 rounded-full bg-surface-sunken p-[3px]"
    >
      {OPTIONS.map(({ value, label }) => {
        const active = value === section
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${
              active
                ? 'bg-white text-ink shadow-[0_1px_3px_#0000000f]'
                : 'text-ink-60 hover:text-ink'
            }`}
            onClick={() => {
              if (!active) onChange(value)
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
