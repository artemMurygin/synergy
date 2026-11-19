import { useState } from 'react'
import { CircleAlert, Pencil, Trash2 } from '../../icons'
import { cn } from '../../lib/cn'
import { formatListTime } from './format-list-time'
import { RenameThreadInput } from './RenameThreadInput'

export type ChatListThread = {
  id: string
  title: string
  /** ISO time of the last activity. */
  lastActivityAt: string
}

type ChatListItemProps = {
  thread: ChatListThread
  active: boolean
  running: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => unknown
  onDelete: (id: string) => unknown
}

type Mode = 'normal' | 'rename' | 'confirmDelete'

const ACTION =
  'flex size-7 shrink-0 items-center justify-center rounded-full text-ink-40 outline-none hover:bg-surface-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-brand-red/40'

/** Compact row of the list (Chat List Item): title, time, running indicator; rename and delete inline. */
export function ChatListItem({ thread, active, running, onSelect, onRename, onDelete }: ChatListItemProps) {
  const [mode, setMode] = useState<Mode>('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMode('normal')
    setError(null)
  }

  const run = async (action: () => unknown, message: string) => {
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

  const errorText = error !== null && <p className="px-3 text-xs text-brand-red">{error}</p>

  if (mode === 'rename') {
    return (
      <li className="flex flex-col gap-1">
        <RenameThreadInput
          initialTitle={thread.title}
          disabled={busy}
          onCancel={reset}
          onSubmit={(title) => void run(() => onRename(thread.id, title), 'Не удалось переименовать чат')}
        />
        {errorText}
      </li>
    )
  }

  if (mode === 'confirmDelete') {
    return (
      <li className="flex flex-col gap-2.5 rounded-xl bg-brand-red-soft p-3">
        <div className="flex items-center gap-2">
          <CircleAlert size={16} className="shrink-0 text-brand-red" />
          <span className="truncate text-sm font-semibold text-ink">{thread.title}</span>
        </div>
        <p className="text-[13px] leading-[1.4] text-ink-80">Удалить чат вместе с историей? Это необратимо.</p>
        {running && (
          <p className="text-xs text-brand-red">Агент сейчас отвечает в этом чате, ответ будет прерван.</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={reset}
            className="h-[30px] rounded-[15px] bg-surface px-3.5 text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => onDelete(thread.id), 'Не удалось удалить чат')}
            className="h-[30px] rounded-[15px] bg-brand-red px-3.5 text-[13px] font-semibold text-white outline-none hover:bg-brand-red-hover disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
        {errorText}
      </li>
    )
  }

  return (
    <li>
      <div
        className={cn(
          'group flex h-9 items-center gap-1 rounded-lg pr-1.5 pl-3',
          active ? 'bg-brand-red-soft' : 'hover:bg-surface-alt',
        )}
      >
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          onClick={() => {
            onSelect(thread.id)
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-80">{thread.title}</span>
          {running && (
            <span
              role="img"
              aria-label="Агент отвечает"
              className="size-2 shrink-0 animate-pulse rounded-full bg-brand-red"
            />
          )}
          <span className="shrink-0 text-xs text-ink-40">{formatListTime(thread.lastActivityAt)}</span>
        </button>
        <span className="hidden items-center group-focus-within:flex group-hover:flex">
          <button
            type="button"
            aria-label="Переименовать"
            className={ACTION}
            onClick={() => {
              setError(null)
              setMode('rename')
            }}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            aria-label="Удалить чат"
            className={ACTION}
            onClick={() => {
              setError(null)
              setMode('confirmDelete')
            }}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
    </li>
  )
}
