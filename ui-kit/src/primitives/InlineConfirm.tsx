import type { KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { Button } from './Button'

export type InlineConfirmProps = {
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
  className?: string
}

export function InlineConfirm({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  className,
}: InlineConfirmProps) {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }
  return (
    <div
      role="group"
      aria-label={message}
      onKeyDown={onKeyDown}
      className={cn('flex items-center gap-2 text-sm text-ink-80', className)}
    >
      <span>{message}</span>
      <Button variant="ghost" className="h-8 px-3 text-sm" onClick={onCancel} autoFocus>
        {cancelLabel}
      </Button>
      <Button className="h-8 rounded-lg px-3 text-sm shadow-none" onClick={onConfirm}>
        {confirmLabel}
      </Button>
    </div>
  )
}
