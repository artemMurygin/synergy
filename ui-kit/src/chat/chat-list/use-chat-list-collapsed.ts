import { useCallback, useState } from 'react'

export const CHAT_LIST_COLLAPSED_KEY = 'synergy.chat-list.collapsed'

function read(): boolean {
  try {
    return sessionStorage.getItem(CHAT_LIST_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/** Hidden / shown state of the chat list; kept for the session. */
export function useChatListCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read)
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        sessionStorage.setItem(CHAT_LIST_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // storage is unavailable: the state lives until the page closes
      }
      return next
    })
  }, [])
  return [collapsed, toggle] as const
}
