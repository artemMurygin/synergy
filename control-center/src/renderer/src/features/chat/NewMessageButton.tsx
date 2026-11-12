import { ArrowDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface NewMessageButtonProps {
  messageCount: number
  isAtBottom: boolean
  onScrollToBottom: () => void
}

/** "Новое сообщение ↓": a message arrived while the feed was scrolled up, so it did not scroll by itself. */
export function NewMessageButton({ messageCount, isAtBottom, onScrollToBottom }: NewMessageButtonProps) {
  const [visible, setVisible] = useState(false)
  const lastCount = useRef(messageCount)

  useEffect(() => {
    if (messageCount > lastCount.current && !isAtBottom) setVisible(true)
    lastCount.current = messageCount
  }, [messageCount, isAtBottom])

  useEffect(() => {
    if (isAtBottom) setVisible(false)
  }, [isAtBottom])

  if (!visible) return null
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 gap-1.5 rounded-full px-4 shadow-sm"
      onClick={() => {
        setVisible(false)
        onScrollToBottom()
      }}
    >
      Новое сообщение
      <ArrowDown aria-hidden className="size-4" />
    </Button>
  )
}
