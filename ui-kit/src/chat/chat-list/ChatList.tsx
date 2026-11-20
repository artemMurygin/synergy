import { ChatListItem, type ChatListThread } from './ChatListItem'
import { ChatListSkeleton } from './ChatListSkeleton'
import { groupOf, type ChatGroup } from './format-list-time'
import { CircleAlert, MessageSquareDashed, PanelLeftClose, RotateCcw, Search, SquarePen, X } from '../../icons'
import { useOptionalLayoutMode } from '../../layout/layout-mode'
import { useToast, type ToastApi } from '../../primitives/Toast'
import { useSearchShortcut } from './use-search-shortcut'
import { useCallback, useState, type ReactNode } from 'react'

export type { ChatListThread }

export type ChatListProps = {
  threads: readonly ChatListThread[]
  activeId: string | null
  /** Ids of the chats where the agent is answering. */
  runningIds: readonly string[]
  state: 'loading' | 'empty' | 'error' | 'ready'
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => unknown
  onDelete: (id: string) => unknown
  onRetry?: () => void
  createDisabled?: boolean
  /** The app draws its own top bar above the list (mobile): no title row, create and hide buttons. */
  hideHeader?: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}

const GROUPS: readonly ChatGroup[] = ['Сегодня', 'Вчера', 'Ранее']

function Notice(props: { icon: ReactNode; tone: 'neutral' | 'error'; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span
        className={`flex size-12 items-center justify-center rounded-full ${
          props.tone === 'error' ? 'bg-brand-red-soft text-brand-red' : 'bg-surface-alt text-ink-60'
        }`}
      >
        {props.icon}
      </span>
      <h2 className="font-display text-[15px] font-semibold text-ink">{props.title}</h2>
      <p className="max-w-[280px] text-[13px] leading-[1.4] text-ink-60">{props.text}</p>
      {props.children}
    </div>
  )
}

const SECONDARY =
  'flex h-9 items-center gap-1.5 rounded-full bg-surface-alt px-4 text-sm font-medium text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40'

type Failure = { title: string; description: string }

/** Runs the action; a failure becomes a toast whose «Повторить» runs the same action with the same value. */
async function attempt(toast: ToastApi, action: () => unknown, failure: Failure): Promise<void> {
  try {
    await action()
  } catch {
    toast.show({
      tone: 'error',
      persistent: true,
      ...failure,
      action: {
        label: 'Повторить',
        onClick: () => {
          void attempt(toast, action, failure)
        },
      },
    })
  }
}

/** List of chats (Chat List): compact rows grouped by day, create, rename, delete, hide. */
export function ChatList(props: ChatListProps) {
  const { threads, activeId, runningIds, state, onSelect, onCreate, onRetry } = props
  const [query, setQuery] = useState('')
  const toast = useToast()
  const desktop = useOptionalLayoutMode() === 'desktop'
  const { onToggleCollapsed } = props
  const clearQuery = useCallback(() => {
    setQuery('')
  }, [])
  const showList = useCallback(() => {
    onToggleCollapsed()
  }, [onToggleCollapsed])
  const { inputRef, onInputKeyDown, hint } = useSearchShortcut({ collapsed: props.collapsed, onShow: showList, onClear: clearQuery })

  const { onRename: renameThread, onDelete: deleteThread } = props
  const onRename = useCallback(
    (id: string, title: string) =>
      attempt(toast, () => renameThread(id, title), {
        title: 'Не удалось переименовать чат',
        description: 'Сервер не принял новое название, прежнее сохранено.',
      }),
    [toast, renameThread],
  )
  const onDelete = useCallback(
    (id: string) =>
      attempt(toast, () => deleteThread(id), {
        title: 'Не удалось удалить чат',
        description: 'Чат остался в списке. Проверьте соединение и повторите.',
      }),
    [toast, deleteThread],
  )
  if (props.collapsed) return null

  const now = new Date()
  const needle = query.trim().toLocaleLowerCase()
  const visible = needle
    ? threads.filter((thread) => thread.title.toLocaleLowerCase().includes(needle))
    : threads
  const groups = GROUPS.map((name) => ({
    name,
    items: visible.filter((thread) => groupOf(thread.lastActivityAt, now) === name),
  })).filter((group) => group.items.length > 0)

  return (
    <section aria-label="Чаты" className="flex h-full min-h-0 flex-col bg-surface">
      {!props.hideHeader && (
        <header className="flex h-15 shrink-0 items-center gap-1.5 pr-3 pl-5">
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">
            Чаты
          </h2>
          <button
            type="button"
            aria-label="Новый чат"
            disabled={props.createDisabled}
            onClick={onCreate}
            className="flex size-9 items-center justify-center rounded-full bg-brand-red text-white outline-none hover:bg-brand-red-hover focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
          >
            <SquarePen size={18} />
          </button>
          <button
            type="button"
            aria-label="Скрыть список чатов"
            onClick={props.onToggleCollapsed}
            className="flex size-9 items-center justify-center rounded-full bg-surface-alt text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <PanelLeftClose size={18} />
          </button>
        </header>
      )}

      {state === 'ready' && (
        <div className="shrink-0 px-3 pb-2">
          <label className="flex h-9 items-center gap-2 rounded-full bg-surface-alt px-3.5 text-ink-40 focus-within:ring-2 focus-within:ring-brand-red/40">
            <Search size={16} />
            <input
              ref={inputRef}
              type="search"
              aria-label="Поиск"
              placeholder={desktop ? hint : 'Поиск'}
              onKeyDown={onInputKeyDown}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-40 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                aria-label="Очистить поиск"
                onClick={() => {
                  setQuery('')
                }}
                className="flex size-5 items-center justify-center rounded-full text-ink-60 outline-none hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </label>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
        {state === 'loading' && <ChatListSkeleton />}
        {state === 'error' && (
          <Notice
            tone="error"
            icon={<CircleAlert size={22} />}
            title="Не удалось загрузить чаты"
            text="Нет связи с сервером. Повторите загрузку"
          >
            {onRetry && (
              <button type="button" className={SECONDARY} onClick={onRetry}>
                <RotateCcw size={16} />
                Повторить
              </button>
            )}
          </Notice>
        )}
        {state === 'empty' && (
          <Notice
            tone="neutral"
            icon={<MessageSquareDashed size={22} />}
            title="Чатов пока нет"
            text="Начните новый чат по любой теме: цены, программы, документы"
          />
        )}
        {state === 'ready' && groups.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-ink-60">Ничего не найдено</p>
        )}
        {state === 'ready' &&
          groups.map((group) => (
            <div key={group.name} className="flex flex-col gap-px pb-3">
              <h3 className="px-3 pt-2 pb-1 text-[11px] font-semibold text-ink-40">{group.name}</h3>
              <ul className="flex flex-col gap-px">
                {group.items.map((thread) => (
                  <ChatListItem
                    key={thread.id}
                    thread={thread}
                    active={thread.id === activeId}
                    running={runningIds.includes(thread.id)}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  )
}
