import type { ReactNode } from 'react'
import { PanelHeader } from '../shell/PanelHeader'

export type ChatHeaderProps = {
  title: string
  /** Время последней активности, например «Сегодня, 14:32». */
  meta?: string
  /** Кнопки действий справа (капсула); пусто — капсулы нет. */
  actions?: ReactNode
  /** Кнопка слева, например «показать список» при скрытом списке. */
  leading?: ReactNode
}

/** Шапка чата (Chat Header): капсула с названием и временем, иконки действий справа. */
export function ChatHeader(props: ChatHeaderProps) {
  return <PanelHeader title={props.title} meta={props.meta} actions={props.actions} leading={props.leading} />
}
