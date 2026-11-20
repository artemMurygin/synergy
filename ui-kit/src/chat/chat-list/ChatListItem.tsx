import { useState } from 'react'
import { Ellipsis, Pencil, Trash2 } from '../../icons'
import { useOptionalLayoutMode } from '../../layout/layout-mode'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../primitives/Menu'
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
  /** A rejection is the owner's to show (ChatList draws a toast); the row just goes back to normal. */
  onRename: (id: string, title: string) => unknown
  onDelete: (id: string) => unknown
}

type Mode = 'normal' | 'rename' | 'confirmDelete'

const MORE =
  'flex size-6 shrink-0 items-center justify-center rounded-md text-ink-60 outline-none hover:bg-surface-sunken hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-red/40 data-[state=open]:opacity-100'
const HOVER_ONLY = 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'

/** Compact row of the list (Chat List Item): title, time, running indicator, «…» menu; rename and delete inline. */
export function ChatListItem({ thread, active, running, onSelect, onRename, onDelete }: ChatListItemProps) {
  const [mode, setMode] = useState<Mode>('normal')
  const [busy, setBusy] = useState(false)
  const mobile = useOptionalLayoutMode() === 'mobile'

  const run = async (action: () => unknown) => {
    setBusy(true)
    try {
      await action()
    } catch {
      // the owner reports the failure; the title stays the previous one
    } finally {
      setBusy(false)
      setMode('normal')
    }
  }

  if (mode === 'rename') {
    return (
      <li className="flex flex-col gap-1">
        <RenameThreadInput
          initialTitle={thread.title}
          disabled={busy}
          onCancel={() => {
            setMode('normal')
          }}
          onSubmit={(title) => void run(() => onRename(thread.id, title))}
        />
      </li>
    )
  }

  if (mode === 'confirmDelete') {
    return (
      <li className="flex flex-col gap-2.5 rounded-xl bg-brand-red-soft p-3">
        <div className="flex items-center gap-2">
          <Trash2 size={16} className="shrink-0 text-brand-red" />
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
            onClick={() => {
              setMode('normal')
            }}
            className="h-[30px] rounded-[15px] bg-surface px-3.5 text-[13px] font-semibold text-ink-80 outline-none hover:bg-surface-sunken"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => onDelete(thread.id))}
            className="h-[30px] rounded-[15px] bg-brand-red px-3.5 text-[13px] font-semibold text-white outline-none hover:bg-brand-red-hover disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
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
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              aria-label="Меню чата"
              className={cn(MORE, !active && !mobile && HOVER_ONLY)}
            >
              <Ellipsis size={16} />
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="flex w-[220px] flex-col gap-0.5 rounded-menu p-2">
            <MenuItem
              onSelect={() => {
                setMode('rename')
              }}
              className="h-11 gap-3 rounded-[14px] px-3 text-sm text-ink-80"
            >
              <Pencil size={18} />
              Переименовать
            </MenuItem>
            <MenuItem
              onSelect={() => {
                setMode('confirmDelete')
              }}
              className="h-11 gap-3 rounded-[14px] px-3 text-sm text-brand-red"
            >
              <Trash2 size={18} />
              Удалить
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  )
}
