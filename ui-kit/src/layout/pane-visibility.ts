import type { LayoutMode } from './layout-mode'

export type ChatPanelMode = 'chat' | 'list'

export interface ChatPaneVisibility {
  list: boolean
  chat: boolean
  /** Нужна ли в шапке чата кнопка, открывающая список. */
  backToList: boolean
}

export function chatPaneVisibility(layout: LayoutMode, mode: ChatPanelMode): ChatPaneVisibility {
  if (layout !== 'mobile') return { list: true, chat: true, backToList: false }
  return { list: mode === 'list', chat: mode === 'chat', backToList: mode === 'chat' }
}

export interface TasksPaneVisibility {
  list: boolean
  details: boolean
  /** Нужна ли на экране деталей кнопка «Назад» к списку. */
  backToList: boolean
}

export function tasksPaneVisibility(layout: LayoutMode, selectedId: string | null): TasksPaneVisibility {
  if (layout !== 'mobile') return { list: true, details: true, backToList: false }
  const hasSelection = selectedId !== null
  return { list: !hasSelection, details: hasSelection, backToList: hasSelection }
}
