export const WIDE_BREAKPOINT = 640

export type PanelMode = 'chat' | 'list'

export function isWidePanel(widthPx: number): boolean {
  return widthPx >= WIDE_BREAKPOINT
}

export interface PaneVisibility {
  list: boolean
  chat: boolean
  /** Whether the chat header needs a button that opens the list. */
  backToList: boolean
}

export function paneVisibility(widthPx: number, mode: PanelMode): PaneVisibility {
  if (isWidePanel(widthPx)) return { list: true, chat: true, backToList: false }
  return { list: mode === 'list', chat: mode === 'chat', backToList: mode === 'chat' }
}
