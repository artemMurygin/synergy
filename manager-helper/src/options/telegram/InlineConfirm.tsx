import { useId } from 'react'
import { SpinnerIcon } from './icons'

interface InlineConfirmProps {
  message: string
  confirmLabel: string
  pendingLabel: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function InlineConfirm({
  message,
  confirmLabel,
  pendingLabel,
  isPending,
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  const messageId = useId()
  return (
    <div
      role="group"
      aria-labelledby={messageId}
      className="flex w-full flex-col gap-3 rounded-xl bg-brand-red-soft px-4 py-3.5"
    >
      <p id={messageId} className="text-sm font-semibold text-ink">
        {message}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          className="flex h-9 items-center justify-center gap-2 rounded-xl bg-red-900 px-4 text-sm font-semibold text-white shadow-[0_6px_16px_#66000033] hover:bg-brand-red-hover disabled:cursor-default disabled:opacity-60 disabled:hover:bg-red-900"
          onClick={onConfirm}
        >
          {isPending && <SpinnerIcon />}
          {isPending ? pendingLabel : confirmLabel}
        </button>
        <button
          type="button"
          disabled={isPending}
          className="flex h-9 items-center justify-center rounded-full border border-field-line bg-white px-4 text-sm font-medium text-ink hover:bg-surface-alt disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white"
          onClick={onCancel}
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
