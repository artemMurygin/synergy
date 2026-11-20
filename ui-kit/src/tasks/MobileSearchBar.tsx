import { useRef } from 'react'
import { ArrowLeft, Search, X } from '../icons'

export type MobileSearchBarProps = {
  value: string
  onChange: (value: string) => void
  /** Закрыть поиск; запрос при этом очищается. */
  onBack: () => void
}

/** Строка поиска в мобильном режиме: «Назад» закрывает и очищает, «Очистить» только очищает поле. */
export function MobileSearchBar({ value, onChange, onBack }: MobileSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 px-4">
      <button
        type="button"
        aria-label="Назад"
        onClick={() => {
          onChange('')
          onBack()
        }}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
      >
        <ArrowLeft />
      </button>
      <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-surface pr-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-brand-red/30">
        <Search size={16} className="shrink-0 text-ink-60" />
        <input
          ref={inputRef}
          autoFocus
          type="search"
          aria-label="Поиск по названию"
          placeholder="Поиск по названию"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-40 [&::-webkit-search-cancel-button]:hidden"
        />
        {value !== '' ? (
          <button
            type="button"
            aria-label="Очистить"
            onClick={() => {
              onChange('')
              inputRef.current?.focus()
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-60 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
