import { useState, type KeyboardEvent } from 'react'
import { Check, X } from '../../icons'

export const MAX_TITLE_LENGTH = 120

type RenameThreadInputProps = {
  initialTitle: string
  onSubmit: (title: string) => void
  onCancel: () => void
  disabled?: boolean
}

/** Inline title editor (Chat List Item · Rename): Enter saves, Esc cancels, 1..120 characters. */
export function RenameThreadInput({ initialTitle, onSubmit, onCancel, disabled }: RenameThreadInputProps) {
  const [value, setValue] = useState(initialTitle)
  const title = value.trim()
  const valid = title.length > 0 && title.length <= MAX_TITLE_LENGTH

  const submit = () => {
    if (!valid) return
    if (title === initialTitle) onCancel()
    else onSubmit(title)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-9 items-center gap-1 rounded-lg border border-brand-red bg-surface pr-1 pl-3">
        <input
          autoFocus
          aria-label="Название чата"
          aria-invalid={!valid}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          aria-label="Сохранить название"
          disabled={disabled || !valid}
          onClick={submit}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-red text-white outline-none disabled:opacity-50"
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          aria-label="Отменить переименование"
          onClick={onCancel}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink-60 outline-none hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
      {!valid && <p className="px-1 text-xs text-brand-red">Название: от 1 до {MAX_TITLE_LENGTH} символов</p>}
    </div>
  )
}
