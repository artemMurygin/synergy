import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export const MAX_TITLE_LENGTH = 120

interface RenameThreadInputProps {
  initialTitle: string
  onSubmit: (title: string) => void
  onCancel: () => void
  disabled?: boolean
}

/** Inline title editor: Enter saves, Esc cancels, 1..120 characters. */
export function RenameThreadInput({
  initialTitle,
  onSubmit,
  onCancel,
  disabled
}: RenameThreadInputProps) {
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
      onCancel()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          aria-label="Название чата"
          aria-invalid={!valid}
          className="h-10 min-w-0 flex-1 rounded-xl border-destructive px-3"
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-xl text-success"
          aria-label="Сохранить название"
          disabled={disabled || !valid}
          onClick={submit}
        >
          <Check className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 rounded-xl text-muted-foreground"
          aria-label="Отменить переименование"
          onClick={onCancel}
        >
          <X className="size-4" />
        </Button>
      </div>
      {!valid && (
        <p className="text-xs text-destructive">Название: от 1 до {MAX_TITLE_LENGTH} символов</p>
      )}
    </div>
  )
}
