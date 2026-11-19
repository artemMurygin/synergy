import { useChatListCollapsed } from '@synergy/ui-kit'
import { ChatLayout } from '@/layouts/ChatLayout'
import { ChatListContainer } from './ChatListContainer'
import { ChatThread } from './ChatThread'

/** The "Чаты" section: the list of chats (can be hidden for the session) and the dialog area. */
export function ChatsScreen() {
  const [collapsed, toggleCollapsed] = useChatListCollapsed()
  return (
    <ChatLayout
      collapsed={collapsed}
      sidebar={<ChatListContainer collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />}
      main={<ChatThread onShowList={collapsed ? toggleCollapsed : undefined} />}
    />
  )
}
