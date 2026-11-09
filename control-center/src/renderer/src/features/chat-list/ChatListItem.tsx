import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Thread } from '@/lib/backend/schema'
import { cn } from '@/lib/utils'
import { formatActivity } from '@/lib/format-activity'
import { RenameThreadInput } from './RenameThreadInput'

interface ChatListItemProps {
  thread: Thread
  active: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void | Promise<unknown>
  onDelete: (id: string) => void | Promise<unknown>
}

type Mode = 'normal' | 'rename' | 'confirmDelete'

const actionButton = 'size-8 shrink-0 rounded-xl text-muted-foreground'

export function ChatListItem({ thread, active, onSelect, onRename, onDelete }: ChatListItemProps) {
  const [mode, setMode] = useState<Mode>('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMode('normal')
    setError(null)
  }

  const run = async (action: () => void | Promise<unknown>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('normal')
    } catch {
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  const errorText = error !== null && <p className="text-xs text-destructive">{error}</p>

  if (mode === 'rename') {
    return (
      <li className="flex flex-col gap-2.5 border-b bg-background px-4 py-3">
        <RenameThreadInput
          initialTitle={thread.title}
          disabled={busy}
          onCancel={reset}
          onSubmit={(title) =>
            void run(() => onRename(thread.id, title), 'Не удалось переименовать чат')
          }
        />
        {errorText}
      </li>
    )
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-2.5 border-b px-4 py-3',
        active ? 'bg-accent' : 'bg-background'
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
          onClick={() => onSelect(thread.id)}
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{thread.title}</span>
            {thread.running && (
              <span
                role="img"
                aria-label="Агент отвечает"
                className="size-2 shrink-0 animate-pulse rounded-full bg-destructive"
              />
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatActivity(thread.lastActivityAt)}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={actionButton}
          aria-label="Переименовать"
          onClick={() => {
            setError(null)
            setMode('rename')
          }}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(actionButton, mode === 'confirmDelete' && 'text-destructive')}
          aria-label="Удалить чат"
          onClick={() => {
            setError(null)
            setMode('confirmDelete')
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {mode === 'confirmDelete' && (
        <>
          <p className="text-[13px] leading-snug">
            Удалить чат вместе с историей? Это необратимо.
          </p>
          {thread.running && (
            <p className="text-xs text-destructive">
              Агент сейчас отвечает в этом чате, ответ будет прерван.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={reset}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => onDelete(thread.id), 'Не удалось удалить чат')}
            >
              Удалить
            </Button>
          </div>
        </>
      )}
      {errorText}
    </li>
  )
}
