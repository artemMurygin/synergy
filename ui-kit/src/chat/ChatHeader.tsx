import type { ReactNode } from 'react'
import { Search } from '../icons'
import { useOptionalLayoutMode } from '../layout/layout-mode'
import { PanelHeader, PanelHeaderButton } from '../shell/PanelHeader'
import { ChatHeaderMenu } from './ChatHeaderMenu'

export type ChatHeaderProps = {
  title: string
  /** Время последней активности, например «Сегодня, 14:32». */
  meta?: string
  /** Дополнительные кнопки справа (капсула); пусто и без обработчиков — капсулы нет. */
  actions?: ReactNode
  /** Кнопка слева, например «показать список» при скрытом списке. */
  leading?: ReactNode
  /** Открывает поиск по сообщениям; кнопка «Поиск по чату» только в desktop и tablet. */
  onSearch?: () => void
  /** Меню «…» («Переименовать», «Удалить») только в desktop и tablet, когда заданы оба обработчика. */
  onRename?: () => void
  onDelete?: () => void
  /** Новый чат без сообщений: меню недоступно. */
  emptyChat?: boolean
}

/** Шапка чата (Chat Header): капсула с названием и временем, иконки поиска и меню справа. */
export function ChatHeader({ title, meta, actions, leading, onSearch, onRename, onDelete, emptyChat = false }: ChatHeaderProps) {
  const wide = useOptionalLayoutMode() !== 'mobile'
  const search = wide && onSearch !== undefined
  const menu = wide && onRename !== undefined && onDelete !== undefined
  const hasActions = actions !== undefined && actions !== null && actions !== false
  return (
    <PanelHeader
      title={title}
      meta={meta}
      leading={leading}
      floating
      actions={
        search || menu || hasActions ? (
          <>
            {actions}
            {search && <PanelHeaderButton label="Поиск по чату" icon={<Search size={18} />} onClick={onSearch} />}
            {menu && <ChatHeaderMenu onRename={onRename} onDelete={onDelete} disabled={emptyChat} />}
          </>
        ) : undefined
      }
    />
  )
}
