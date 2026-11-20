import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

export function isMacPlatform(platform: string = typeof navigator === 'undefined' ? '' : navigator.platform): boolean {
  return /^mac/i.test(platform)
}

export type UseSearchShortcutOptions = {
  /** The list is hidden: the shortcut shows it first. */
  collapsed: boolean
  onShow: () => void
  /** Escape in the search clears it. */
  onClear: () => void
  /** For tests; by default taken from the platform. */
  isMac?: boolean
}

/** Cmd+K (macOS) / Ctrl+K (others) focuses the chat search; Escape in the search clears it and returns focus to the composer. */
export function useSearchShortcut({ collapsed, onShow, onClear, isMac }: UseSearchShortcutOptions) {
  const mac = isMac ?? isMacPlatform()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return
      if (mac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) return
      event.preventDefault()
      if (collapsed) onShow()
      setPending(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mac, collapsed, onShow])

  useEffect(() => {
    if (!pending || collapsed || !inputRef.current) return
    inputRef.current.focus()
    inputRef.current.select()
    setPending(false)
  }, [pending, collapsed])

  const onInputKeyDown = useCallback(
    (event: Pick<KeyboardEvent<HTMLInputElement>, 'key' | 'preventDefault'>) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClear()
      document.querySelector<HTMLElement>('[data-chat-composer-input]')?.focus()
    },
    [onClear],
  )

  return { inputRef, onInputKeyDown, hint: `Поиск (${mac ? '⌘K' : 'Ctrl+K'})` }
}
