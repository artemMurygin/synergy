import { ListIcon, NewChatIcon, SettingsIcon } from './icons'

interface Props {
  title: string
  /** Omitted when the list is always visible (wide panel). */
  onOpenList?: () => void
  onNewChat: () => void
  onOpenSettings: () => void
  newChatDisabled?: boolean
}

const iconButton =
  'flex size-8 items-center justify-center rounded-lg text-ink hover:bg-surface-alt disabled:text-ink-40 disabled:hover:bg-transparent'

export function ChatHeader({
  title,
  onOpenList,
  onNewChat,
  onOpenSettings,
  newChatDisabled,
}: Props) {
  return (
    <header className="flex items-center gap-2 border-b border-line px-3 py-2">
      {onOpenList && (
        <button
          type="button"
          aria-label="К списку чатов"
          className={iconButton}
          onClick={onOpenList}
        >
          <ListIcon />
        </button>
      )}
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
        {title.trim().length > 0 ? title : 'Новый чат'}
      </h1>
      <button
        type="button"
        aria-label="Новый чат"
        className={iconButton}
        disabled={newChatDisabled}
        onClick={onNewChat}
      >
        <NewChatIcon />
      </button>
      <button type="button" aria-label="Настройки" className={iconButton} onClick={onOpenSettings}>
        <SettingsIcon />
      </button>
    </header>
  )
}
