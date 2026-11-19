import { ChatsLayout, useChatListCollapsed } from '@synergy/ui-kit'
import { ChatListContainer } from './ChatListContainer'
import { ChatThread } from './ChatThread'

/** The "Чаты" section: the list of chats (can be hidden for the session) and the dialog area. */
export function ChatsScreen() {
  const [collapsed, toggleCollapsed] = useChatListCollapsed()
  return (
    <ChatsLayout
      listHidden={collapsed}
      list={<ChatListContainer collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />}
      chat={<ChatThread onShowList={collapsed ? toggleCollapsed : undefined} />}
    />
  )
}
