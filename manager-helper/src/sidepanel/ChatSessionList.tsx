import type { Thread } from '@/shared/threads-api'
import { ChatSessionItem } from './ChatSessionItem'
import { ArrowLeftIcon, ChatsIcon, CloudOffIcon, PlusIcon } from './icons'

interface Props {
  sessions: Thread[]
  activeId: string | null
  status: 'loading' | 'ready' | 'error'
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (id: string, title: string) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  onRetry: () => void
  /** Omitted when the list is always visible next to the chat (wide panel). */
  onBack?: () => void
  createDisabled?: boolean
}

const primary =
  'flex items-center gap-1 rounded-full bg-brand-red px-4 py-2 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:bg-ink-40'
const secondary =
  'rounded-full border border-line bg-surface-alt px-5 py-2 text-sm font-semibold text-ink hover:bg-surface-sunken'

function Skeleton() {
  return (
    <div role="status" aria-label="Загрузка чатов">
      {[70, 52, 78, 56, 74].map((width, index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col gap-2 border-b border-line px-4 py-4"
        >
          <div className="h-3 rounded bg-surface-sunken" style={{ width: `${String(width)}%` }} />
          <div className="h-2.5 w-1/6 rounded bg-surface-sunken" />
        </div>
      ))}
    </div>
  )
}

function Notice(props: {
  icon: React.ReactNode
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="m-auto flex max-w-64 flex-col items-center gap-2 px-4 text-center">
      <span className="text-ink-40">{props.icon}</span>
      <h2 className="text-sm font-bold text-ink">{props.title}</h2>
      <p className="text-xs text-ink-60">{props.text}</p>
      <div className="mt-2">{props.children}</div>
    </div>
  )
}

export function ChatSessionList(props: Props) {
  const { sessions, activeId, status, onSelect, onCreate, onRename, onDelete, onRetry, onBack } =
    props

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        {onBack && (
          <button
            type="button"
            aria-label="Назад к чату"
            className="flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-alt"
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </button>
        )}
        <h2 className="flex-1 text-base font-semibold text-ink">Чаты</h2>
        <button
          type="button"
          className={primary}
          disabled={props.createDisabled}
          onClick={onCreate}
        >
          <PlusIcon />
          Новый чат
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {status === 'loading' && <Skeleton />}
        {status === 'error' && (
          <Notice
            icon={<CloudOffIcon />}
            title="Не удалось загрузить чаты"
            text="Не удалось связаться с сервером. Он запущен?"
          >
            <button type="button" className={secondary} onClick={onRetry}>
              Повторить
            </button>
          </Notice>
        )}
        {status === 'ready' && sessions.length === 0 && (
          <Notice
            icon={<ChatsIcon />}
            title="Чатов пока нет"
            text="Начните новый чат по любой теме: цены, программы, документы."
          >
            <button
              type="button"
              className={primary}
              disabled={props.createDisabled}
              onClick={onCreate}
            >
              Начать чат
            </button>
          </Notice>
        )}
        {status === 'ready' && sessions.length > 0 && (
          <ul>
            {sessions.map((session) => (
              <ChatSessionItem
                key={session.id}
                session={session}
                active={session.id === activeId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
