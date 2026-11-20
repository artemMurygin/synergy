import { SlidersHorizontal } from '@synergy/ui-kit/icons'

interface Props {
  onClick: () => void
  disabled?: boolean
}

/** Pill "Подбор" in the tools slot of the composer: opens the quick search sheet. */
export function QuickSearchButton({ onClick, disabled = false }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full bg-brand-red-soft px-3.5 text-[13px] font-semibold text-brand-red outline-none hover:bg-brand-red-soft/70 focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
    >
      <SlidersHorizontal size={16} />
      Подбор
    </button>
  )
}
