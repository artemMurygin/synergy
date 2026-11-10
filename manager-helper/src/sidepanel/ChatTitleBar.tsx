import { ListIcon } from './icons'

interface Props {
  title: string
  /** Omitted when the list is always visible (wide panel). */
  onOpenList?: () => void
  /** The agent is answering in this chat. */
  running?: boolean
}

/** Context row of the chat under the panel header: back to the list and the chat title. */
export function ChatTitleBar({ title, onOpenList, running }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
      {onOpenList && (
        <button
          type="button"
          aria-label="К списку чатов"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-alt"
          onClick={onOpenList}
        >
          <ListIcon />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
        {title.trim().length > 0 ? title : 'Новый чат'}
      </h1>
      {running && (
        <span
          role="img"
          aria-label="Агент отвечает"
          className="size-2 shrink-0 animate-pulse rounded-full bg-brand-red"
        />
      )}
    </div>
  )
}
