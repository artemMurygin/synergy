import { useEffect } from 'react'
import { ChatList } from '@/features/chat-list'
import { ChatThread } from '@/features/chat'
import { ChatLayout } from '@/layouts/ChatLayout'
import { useUiStore } from '@/stores/ui.store'

export default function App() {
  const dark = useUiStore((state) => state.dark)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return <ChatLayout sidebar={<ChatList />} main={<ChatThread />} />
}
