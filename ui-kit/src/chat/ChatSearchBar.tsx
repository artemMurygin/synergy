import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Search, X } from '../icons'

export type ChatSearchBarProps = {
  open: boolean
  query: string
  onQueryChange: (query: string) => void
  /** Number of the current match from 1. */
  current: number
  total: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

const ROUND =
  'flex size-9 shrink-0 items-center justify-center rounded-full text-ink-80 outline-none hover:bg-border focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Search row in the header of the chat (Search Bar): field, counter «N из M», up / down and close. */
export function ChatSearchBar({ open, query, onQueryChange, current, total, onNext, onPrev, onClose }: ChatSearchBarProps) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  if (!open) return null
  const searching = query.trim() !== ''
  const empty = searching && total === 0
  return (
    <div role="search" className="flex h-16 shrink-0 items-center gap-2 px-3 font-chat">
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[22px] bg-surface/95 px-[18px] shadow-panel backdrop-blur-sm">
        <Search size={18} className="shrink-0 text-ink-60" />
        <input
          ref={input}
          type="search"
          aria-label="Поиск по чату"
          placeholder="Поиск по сообщениям"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (event.shiftKey) onPrev()
              else onNext()
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-40 [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <span aria-live="polite" className={empty ? 'shrink-0 text-[13px] text-brand-red' : 'shrink-0 text-[13px] text-ink-60'}>
            {empty ? 'Нет совпадений' : `${String(current)} из ${String(total)}`}
          </span>
        )}
      </div>
      {total > 0 && searching && (
        <>
          <button type="button" aria-label="Предыдущее совпадение" onClick={onPrev} className={ROUND}>
            <ChevronUp size={18} />
          </button>
          <button type="button" aria-label="Следующее совпадение" onClick={onNext} className={ROUND}>
            <ChevronDown size={18} />
          </button>
        </>
      )}
      <button type="button" aria-label="Закрыть поиск" onClick={onClose} className={ROUND}>
        <X size={18} />
      </button>
    </div>
  )
}
