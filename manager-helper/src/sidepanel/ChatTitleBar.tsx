import { MessagesSquare } from '@synergy/ui-kit/icons'

interface Props {
  title: string
  /** Omitted when the list is always visible: opens the list (narrow panel) or shows the hidden one. */
  onOpenList?: () => void
  /** Accessible name of the list button. */
  openListLabel?: string
  /** The agent is answering in this chat. */
  running?: boolean
}

/** Context row of the chat under the panel header: the list button and the chat title. */
export function ChatTitleBar({
  title,
  onOpenList,
  openListLabel = 'К списку чатов',
  running,
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      {onOpenList && (
        <button
          type="button"
          aria-label={openListLabel}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink hover:bg-surface-sunken"
          onClick={onOpenList}
        >
          <MessagesSquare />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">
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
