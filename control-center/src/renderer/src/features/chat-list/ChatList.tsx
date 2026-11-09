import { useQuery } from '@tanstack/react-query'
import { CloudOff, MessagesSquare, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chat.store'
import { threadsQuery, useCreateThread, useDeleteThread, useRenameThread } from '@/lib/backend/threads.queries'
import { ChatListItem } from './ChatListItem'
import { ChatListSkeleton } from './ChatListSkeleton'

function Notice(props: {
  icon: React.ReactNode
  title: string
  text: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {props.icon}
      <h2 className="text-base font-semibold">{props.title}</h2>
      <p className="max-w-[260px] text-[13px] leading-snug text-muted-foreground">{props.text}</p>
      {props.children}
    </div>
  )
}

export function ChatList() {
  const query = useQuery(threadsQuery())
  const create = useCreateThread()
  const rename = useRenameThread()
  const remove = useDeleteThread()
  const activeThreadId = useChatStore((state) => state.activeThreadId)
  const setActiveThread = useChatStore((state) => state.setActiveThread)
  const createChat = () => create.mutate()

  return (
    <section className="flex h-full min-h-0 flex-col border-r bg-secondary">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="flex-1 text-lg font-semibold">Чаты</h2>
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 rounded-xl px-3.5"
          disabled={create.isPending}
          onClick={createChat}
        >
          <Plus className="size-4" />
          Новый чат
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {query.isPending && <ChatListSkeleton />}
        {query.isError && (
          <Notice
            icon={<CloudOff className="size-9 text-primary" />}
            title="Не удалось загрузить чаты"
            text="Не удалось связаться с сервером. Он запущен?"
          >
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-6"
              onClick={() => void query.refetch()}
            >
              Повторить
            </Button>
          </Notice>
        )}
        {query.isSuccess && query.data.length === 0 && (
          <Notice
            icon={<MessagesSquare className="size-9 text-muted-foreground" />}
            title="Чатов пока нет"
            text="Начните новый чат по любой теме: цены, программы, документы"
          >
            <Button
              type="button"
              className="h-11 rounded-xl px-6"
              disabled={create.isPending}
              onClick={createChat}
            >
              Начать чат
            </Button>
          </Notice>
        )}
        {query.isSuccess && query.data.length > 0 && (
          <ul>
            {query.data.map((thread) => (
              <ChatListItem
                key={thread.id}
                thread={thread}
                active={thread.id === activeThreadId}
                onSelect={setActiveThread}
                onRename={(id, title) => rename.mutateAsync({ id, title })}
                onDelete={(id) => remove.mutateAsync(id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
