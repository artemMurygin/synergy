import { ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader, MessageSquare, MessagesSquare } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { threadsQuery, useCreateThread } from '@/lib/backend/threads.queries'
import { formatActivity } from '@/lib/format-activity'
import { useChatStore } from '@/stores/chat.store'
import { AssistantMessage } from './AssistantMessage'
import { ChatRuntimeProvider } from './ChatRuntimeProvider'
import { Composer } from './Composer'
import { RunNotice } from './RunNotice'
import { UserMessage } from './UserMessage'
import { useCancelRun } from './use-cancel-run'
import { useThreadHistory } from './use-thread-history'

const POLL_MS = 2000

/** Dialog area: no chat selected, or the history and the composer of the active chat. */
export function ChatThread() {
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  if (activeThreadId === null) return <NoChat />
  return <OpenChat key={activeThreadId} threadId={activeThreadId} />
}

function NoChat() {
  const create = useCreateThread()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <MessagesSquare className="size-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">Выберите чат</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Откройте чат из списка слева или начните новый
      </p>
      <Button
        className="rounded-xl px-5 font-semibold"
        disabled={create.isPending}
        onClick={() => {
          create.mutate()
        }}
      >
        Новый чат
      </Button>
    </div>
  )
}

function Header({ threadId }: { threadId: string }) {
  const { data } = useQuery(threadsQuery())
  const thread = data?.find((t) => t.id === threadId)
  if (thread === undefined) return null
  return (
    <header className="flex items-baseline gap-3 border-b px-6 py-4">
      <h2 className="truncate text-base font-semibold">{thread.title}</h2>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatActivity(thread.lastActivityAt)}
      </span>
    </header>
  )
}

function OpenChat({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient()
  const history = useThreadHistory(threadId)
  const { refetch } = history

  // The runtime holds the live chat: a cached history must not be shown stale on the next open
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ['threads', threadId, 'history'] })
    },
    [queryClient, threadId]
  )

  // The agent of this chat is still answering on the server: wait for the answer
  useEffect(() => {
    if (!history.running) return
    const timer = setInterval(() => {
      void refetch()
    }, POLL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [history.running, refetch])

  // A run that was going on the server has finished: the title and activity time changed
  const wasServerRunning = useRef(false)
  useEffect(() => {
    if (wasServerRunning.current && !history.running) {
      void queryClient.invalidateQueries({ queryKey: threadsQuery().queryKey, exact: true })
    }
    wasServerRunning.current = history.running
  }, [history.running, queryClient])

  let body
  if (history.isInitialLoad) {
    body = (
      <div role="status" aria-label="Загрузка истории" className="flex flex-col gap-3 p-6">
        <Skeleton className="h-10 w-2/3 self-end" />
        <Skeleton className="h-16 w-3/4" />
      </div>
    )
  } else if (history.error !== null) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">Не удалось загрузить историю чата</p>
        <Button
          variant="outline"
          onClick={() => {
            void refetch()
          }}
        >
          Повторить
        </Button>
      </div>
    )
  } else {
    body = (
      <ChatRuntimeProvider
        key={String(history.running)}
        threadId={threadId}
        initialMessages={history.messages}
      >
        <ThreadBody threadId={threadId} serverRunning={history.running} onStopped={refetch} />
      </ChatRuntimeProvider>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header threadId={threadId} />
      {body}
    </div>
  )
}

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('')
}

interface ThreadBodyProps {
  threadId: string
  /** The server still runs the agent of this chat (not a local run of the runtime). */
  serverRunning: boolean
  onStopped: () => unknown
}

function ThreadBody({ threadId, serverRunning, onStopped }: ThreadBodyProps) {
  const aui = useAui()
  const cancel = useCancelRun(threadId)
  const messages = useAuiState((s) => s.thread.messages)
  const localRunning = useAuiState((s) => s.thread.isRunning)

  const last = messages.at(-1)
  const lastStatus = last?.role === 'assistant' ? last.status : undefined
  const failed = lastStatus?.type === 'incomplete' && lastStatus.reason === 'error'

  // The composer empties on send: when the run fails, the question goes back into it
  const restored = useRef('')
  const question = messages.filter((m) => m.role === 'user').at(-1)
  const questionText = question === undefined ? '' : answerText(question.content)
  useEffect(() => {
    if (!failed || questionText === '' || aui.composer().getState().text !== '') return
    restored.current = questionText
    aui.composer().setText(questionText)
  }, [failed, questionText, aui])
  // A retry sends the question again: the restored copy must not stay behind
  useEffect(() => {
    if (!localRunning) return
    if (restored.current !== '' && aui.composer().getState().text === restored.current) {
      aui.composer().setText('')
    }
    restored.current = ''
  }, [localRunning, aui])

  const running = localRunning || serverRunning

  // A finished run changes the chat title (auto name) and activity time: refresh the list
  const queryClient = useQueryClient()
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: threadsQuery().queryKey, exact: true })
    }
    wasRunning.current = running
  }, [running, queryClient])

  return (
    <>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-180 flex-1 flex-col gap-3 px-6 py-6">
            {messages.length === 0 && !serverRunning && (
              <div className="m-auto flex flex-col items-center gap-2 text-center">
                <MessageSquare className="size-8 text-muted-foreground" />
                <h2 className="text-base font-semibold">Задайте вопрос по таблицам</h2>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Агент ответит на основе данных в Google Sheets
                </p>
              </div>
            )}
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
            {localRunning && (
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="size-2 animate-pulse rounded-full bg-primary" />
                Агент отвечает…
              </p>
            )}
            {serverRunning && !localRunning && (
              <RunNotice
                tone="info"
                role="status"
                icon={<Loader className="size-4" />}
                title="Агент ещё отвечает"
                text="Ответ появится в чате, когда будет готов."
              />
            )}
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
      <div className="mx-auto w-full max-w-180">
        <Composer
          running={running}
          disabled={serverRunning}
          onStop={() => {
            if (localRunning) aui.thread().cancelRun()
            else cancel.mutate(undefined, { onSuccess: () => void onStopped() })
          }}
        />
      </div>
    </>
  )
}
