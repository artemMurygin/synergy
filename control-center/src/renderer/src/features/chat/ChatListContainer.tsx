import { ChatList } from '@synergy/ui-kit'
import { useQuery } from '@tanstack/react-query'
import { threadsQuery, useCreateThread, useDeleteThread, useRenameThread } from '@/lib/backend/threads.queries'
import { useChatStore } from '@/stores/chat.store'

interface ChatListContainerProps {
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Chat list of the package fed by the threads query; the active chat lives in the chat store. */
export function ChatListContainer({ collapsed, onToggleCollapsed }: ChatListContainerProps) {
  const query = useQuery(threadsQuery())
  const create = useCreateThread()
  const rename = useRenameThread()
  const remove = useDeleteThread()
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const setActiveThread = useChatStore((s) => s.setActiveThread)

  const threads = query.data ?? []
  let state: 'loading' | 'empty' | 'error' | 'ready' = 'ready'
  if (query.isError && query.data === undefined) state = 'error'
  else if (query.isPending) state = 'loading'
  else if (threads.length === 0) state = 'empty'

  return (
    <ChatList
      threads={threads}
      activeId={activeThreadId}
      runningIds={threads.filter((thread) => thread.running).map((thread) => thread.id)}
      state={state}
      createDisabled={create.isPending}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      onSelect={setActiveThread}
      onCreate={() => {
        create.mutate()
      }}
      onRename={(id, title) => rename.mutateAsync({ id, title })}
      onDelete={(id) => remove.mutateAsync(id)}
      onRetry={() => {
        void query.refetch()
      }}
    />
  )
}
