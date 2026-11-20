import { useLayoutMode } from '@synergy/ui-kit'
import { SlidersHorizontal, X } from '@synergy/ui-kit/icons'
import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { QuickSearchForm } from './QuickSearchForm'
import type { QuickSearchValues } from './defaults'

interface Props {
  open: boolean
  value: QuickSearchValues
  onChange: (value: QuickSearchValues) => void
  /** Receives the query and the chat title; the sheet closes itself. */
  onSubmit: (query: string, title: string) => void
  /** The agent is answering: nothing can be sent. */
  pending: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bottom sheet with the quick search form. On a narrow panel it covers the panel; on a wide one
 * it covers only the chat column (the nearest positioned ancestor), the list of chats stays visible.
 */
export function QuickSearchSheet({ open, value, onChange, onSubmit, pending, onOpenChange }: Props) {
  const layout = useLayoutMode()
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) dialog.current?.focus()
  }, [open])

  if (!open) return null

  const close = () => {
    onOpenChange(false)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }

  return (
    <div
      data-quick-search-scrim=""
      className={`${layout === 'mobile' ? 'fixed' : 'absolute'} inset-0 z-50 flex items-end bg-ink/35`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый подбор"
        tabIndex={-1}
        className="flex max-h-[92%] w-full flex-col rounded-t-[28px] bg-surface px-4 pt-2.5 pb-4 font-chat outline-none"
      >
        <div className="flex shrink-0 justify-center pb-3">
          <div className="h-1 w-9 rounded-full bg-border-strong" />
        </div>
        <QuickSearchForm
          value={value}
          onChange={onChange}
          pending={pending}
          onSubmit={(query, title) => {
            close()
            onSubmit(query, title)
          }}
          header={
            <div className="flex shrink-0 items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-red-soft text-brand-red">
                <SlidersHorizontal size={16} />
              </span>
              <h2 className="flex-1 font-display text-lg font-semibold text-ink">Быстрый подбор</h2>
              <button
                type="button"
                aria-label="Закрыть"
                className="flex size-9 items-center justify-center rounded-full bg-surface-alt text-ink hover:bg-surface-sunken"
                onClick={close}
              >
                <X size={18} />
              </button>
            </div>
          }
        />
      </div>
    </div>
  )
}
