import { useState } from 'react'
import { ArrowDown } from '../icons'

type NewMessageButtonProps = {
  messageCount: number
  isAtBottom: boolean
  onScrollToBottom: () => void
}

/** "Новое сообщение ↓": a message arrived while the feed was scrolled up, so it did not scroll by itself. */
export function NewMessageButton({ messageCount, isAtBottom, onScrollToBottom }: NewMessageButtonProps) {
  const [visible, setVisible] = useState(false)
  const [seen, setSeen] = useState({ messageCount, isAtBottom })

  // Derived during render: a new message while scrolled up shows the button, reaching the bottom hides it
  if (seen.messageCount !== messageCount || seen.isAtBottom !== isAtBottom) {
    setSeen({ messageCount, isAtBottom })
    if (isAtBottom) setVisible(false)
    else if (messageCount > seen.messageCount) setVisible(true)
  }

  if (!visible) return null
  return (
    <button
      type="button"
      onClick={() => {
        setVisible(false)
        onScrollToBottom()
      }}
      className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-4 font-chat text-[13px] font-medium text-ink shadow-panel outline-none hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-brand-red/40"
    >
      Новое сообщение
      <ArrowDown size={16} />
    </button>
  )
}
