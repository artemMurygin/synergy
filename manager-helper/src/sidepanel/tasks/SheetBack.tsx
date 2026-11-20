import { ChevronLeft, X } from '@synergy/ui-kit/icons'
import { Dialog as DialogPrimitive } from 'radix-ui'

const round =
  'flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Header of a nested sheet (AxP1M, U2q8r): "Назад" to the form, the title, "Закрыть". */
export function SheetBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="-mx-1 flex h-9 shrink-0 items-center gap-2">
      <button type="button" aria-label="Назад" onClick={onBack} className={round}>
        <ChevronLeft size={18} />
      </button>
      <h2 className="flex-1 truncate text-center font-display text-lg font-semibold text-ink">{title}</h2>
      <DialogPrimitive.Close aria-label="Закрыть" className={round}>
        <X size={18} />
      </DialogPrimitive.Close>
    </div>
  )
}
