import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Thread } from '@/shared/threads-api'
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from './icons'
import { formatActivity } from './session-time'

interface Props {
  session: Thread
  active: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

type Mode = 'idle' | 'renaming' | 'confirming'

// Цвет иконки задаёт каждая кнопка сама: иначе text-ink-40 перебивает цвет состояния.
const actionButton =
  'flex size-8 shrink-0 items-center justify-center rounded-xl hover:bg-surface-sunken disabled:opacity-50'
const mutedAction = `${actionButton} text-ink-40 hover:text-ink`

export function ChatSessionItem({ session, active, onSelect, onRename, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [name, setName] = useState(session.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setMode('idle')
    setError(null)
  }

  const saveName = async () => {
    const next = name.trim()
    if (next.length === 0 || next === session.title) return
    setBusy(true)
    setError(null)
    try {
      await onRename(session.id, next)
      setMode('idle')
    } catch {
      setError('Не удалось переименовать чат')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDelete(session.id)
      setMode('idle')
    } catch {
      setError('Не удалось удалить чат')
    } finally {
      setBusy(false)
    }
  }

  const onNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void saveName()
    } else if (event.key === 'Escape') {
      reset()
    }
  }

  const errorText = error !== null && <p className="px-4 pb-2 text-xs text-brand-red">{error}</p>

  if (mode === 'renaming') {
    return (
      <li className="border-b border-line">
        <div className="flex items-center gap-2 px-4 py-3">
          <input
            autoFocus
            aria-label="Название чата"
            maxLength={120}
            className="h-10 min-w-0 flex-1 rounded-xl border border-brand-red px-4 text-[15px] text-ink outline-none"
            value={name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value)
            }}
            onKeyDown={onNameKeyDown}
          />
          <button
            type="button"
            aria-label="Сохранить название"
            className={`${actionButton} text-success hover:text-success`}
            disabled={busy}
            onClick={() => void saveName()}
          >
            <CheckIcon />
          </button>
          <button
            type="button"
            aria-label="Отменить переименование"
            className={`${actionButton} text-ink-60 hover:text-ink`}
            onClick={reset}
          >
            <CloseIcon />
          </button>
        </div>
        {errorText}
      </li>
    )
  }

  return (
    <li className={`border-b border-line ${active ? 'bg-brand-red-soft' : ''}`}>
      <div className="flex items-center gap-1 pr-3">
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          className="flex min-w-0 flex-1 flex-col items-start px-4 py-3 text-left"
          onClick={() => {
            onSelect(session.id)
          }}
        >
          <span className="flex w-full items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-ink">{session.title}</span>
            {session.running && (
              <span
                role="img"
                aria-label="Агент отвечает"
                className="size-2 shrink-0 animate-pulse rounded-full bg-brand-red"
              />
            )}
          </span>
          <span className="text-xs text-ink-60">{formatActivity(session.lastActivityAt)}</span>
        </button>
        <button
          type="button"
          aria-label="Переименовать"
          className={mutedAction}
          onClick={() => {
            setName(session.title)
            setError(null)
            setMode('renaming')
          }}
        >
          <PencilIcon />
        </button>
        <button
          type="button"
          aria-label="Удалить чат"
          className={mode === 'confirming' ? `${actionButton} text-brand-red` : mutedAction}
          onClick={() => {
            setError(null)
            setMode('confirming')
          }}
        >
          <TrashIcon />
        </button>
      </div>
      {mode === 'confirming' && (
        <div className="px-4 pb-3">
          <p className="text-[13px] text-ink-80">Удалить чат вместе с историей? Это необратимо.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-2xl border border-field-line bg-surface-alt px-3.5 text-[13px] font-semibold text-ink hover:bg-surface-sunken"
              disabled={busy}
              onClick={reset}
            >
              Отмена
            </button>
            <button
              type="button"
              className="h-9 rounded-2xl bg-brand-red px-3.5 text-[13px] font-semibold text-white shadow-[0_4px_10px_#66000033] hover:bg-brand-red-hover disabled:opacity-50"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Удалить
            </button>
          </div>
        </div>
      )}
      {errorText}
    </li>
  )
}
