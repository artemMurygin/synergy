import { useAui, useAuiState } from '@assistant-ui/react'
import { Button, Composer, Skeleton, Thread, useComposerAttachments } from '@synergy/ui-kit'
import { MessagesSquare, PanelLeftOpen, Plus } from '@synergy/ui-kit/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, type ReactNode } from 'react'
import { threadsQuery, useCreateThread } from '@/lib/backend/threads.queries'
import { formatActivity } from '@/lib/format-activity'
import { useChatStore } from '@/stores/chat.store'
import { ChatRuntimeProvider } from './ChatRuntimeProvider'
import { DownloadErrorNotice, FileDownloadsProvider, useFileDownloads } from './file-downloads'
import { goneFileId, isFileGone } from './run-errors'
import { useCancelRun } from './use-cancel-run'
import { useFileUploadPort } from './use-file-upload-port'
import { useThreadHistory } from './use-thread-history'

const POLL_MS = 2000

interface ChatThreadProps {
  /** Set while the chat list is hidden: the button that shows it again and the one that starts a chat. */
  onShowList?: () => void
}

/** Dialog area: no chat selected, or the history and the composer of the active chat. */
export function ChatThread({ onShowList }: ChatThreadProps) {
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  if (activeThreadId === null) return <NoChat onShowList={onShowList} />
  return <OpenChat key={activeThreadId} threadId={activeThreadId} onShowList={onShowList} />
}

/** Header pill of the dialog area (Chat Header): the buttons of the hidden list, then the title. */
function Header({ children, onShowList }: { children?: ReactNode; onShowList?: () => void }) {
  const create = useCreateThread()
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-3">
      {onShowList !== undefined && (
        <div className="flex h-11 items-center rounded-[22px] bg-surface-alt px-1">
          <button
            type="button"
            aria-label="Показать список чатов"
            onClick={onShowList}
            className="flex size-9 items-center justify-center rounded-full text-ink-80 outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-brand-red/40"
          >
            <PanelLeftOpen />
          </button>
          <button
            type="button"
            aria-label="Новый чат"
            disabled={create.isPending}
            onClick={() => {
              create.mutate()
            }}
            className="flex size-9 items-center justify-center rounded-full bg-brand-red text-white outline-none hover:bg-brand-red-hover focus-visible:ring-2 focus-visible:ring-brand-red/40 disabled:opacity-50"
          >
            <Plus />
          </button>
        </div>
      )}
      {children}
    </header>
  )
}

function NoChat({ onShowList }: { onShowList?: () => void }) {
  const create = useCreateThread()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header onShowList={onShowList} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <MessagesSquare size={32} className="text-ink-40" />
        <h2 className="font-display text-lg font-semibold text-ink">Выберите чат</h2>
        <p className="max-w-xs text-sm text-ink-60">Откройте чат из списка слева или начните новый</p>
        <Button
          disabled={create.isPending}
          onClick={() => {
            create.mutate()
          }}
        >
          Новый чат
        </Button>
      </div>
    </div>
  )
}

function TitlePill({ threadId }: { threadId: string }) {
  const { data } = useQuery(threadsQuery())
  const thread = data?.find((t) => t.id === threadId)
  if (thread === undefined) return null
  return (
    <div className="flex h-11 min-w-0 items-center gap-2.5 rounded-[22px] bg-surface-alt px-[18px]">
      <h2 className="truncate font-display text-base font-semibold text-ink">{thread.title}</h2>
      <span className="shrink-0 text-xs text-ink-60">{formatActivity(thread.lastActivityAt)}</span>
    </div>
  )
}

function OpenChat({ threadId, onShowList }: { threadId: string; onShowList?: () => void }) {
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
      <div role="status" aria-label="Загрузка истории" className="mx-auto flex w-full max-w-180 flex-col gap-3 p-6">
        <Skeleton className="h-10 w-2/3 self-end" />
        <Skeleton className="h-16 w-3/4" />
      </div>
    )
  } else if (history.error !== null) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-ink-60">Не удалось загрузить историю чата</p>
        <Button
          variant="secondary"
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
      <ChatRuntimeProvider key={String(history.running)} threadId={threadId} initialMessages={history.messages}>
        <FileDownloadsProvider>
          <ThreadBody threadId={threadId} serverRunning={history.running} onStopped={refetch} />
        </FileDownloadsProvider>
      </ChatRuntimeProvider>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header onShowList={onShowList}>
        <TitlePill threadId={threadId} />
      </Header>
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
  const { download, pending } = useFileDownloads()
  const messages = useAuiState((s) => s.thread.messages)
  const localRunning = useAuiState((s) => s.thread.isRunning)

  const last = messages.at(-1)
  const lastStatus = last?.role === 'assistant' ? last.status : undefined
  const failed = lastStatus?.type === 'incomplete' && lastStatus.reason === 'error'
  const attachments = useComposerAttachments(useFileUploadPort())

  // The run was refused because a sent file expired: its card comes back failed
  const lastError = failed && typeof lastStatus.error === 'string' ? lastStatus.error : ''
  const lastId = last?.id
  const { restoreExpired } = attachments
  useEffect(() => {
    if (lastId === undefined || !isFileGone(lastError)) return
    restoreExpired(goneFileId(lastError))
  }, [lastId, lastError, restoreExpired])

  // The composer empties on send: when the run fails, the question goes back into it
  const restored = useRef('')
  const question = messages.filter((m) => m.role === 'user').at(-1)
  const questionText = question === undefined ? '' : answerText(question.content)
  useEffect(() => {
    if (!failed || questionText === '' || aui.composer.getState().text !== '') return
    restored.current = questionText
    aui.composer.setText(questionText)
  }, [failed, questionText, aui])
  // A retry sends the question again: the restored copy must not stay behind
  useEffect(() => {
    if (!localRunning) return
    if (restored.current !== '' && aui.composer.getState().text === restored.current) {
      aui.composer.setText('')
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
      <div className="mx-auto w-full max-w-180 px-6 empty:hidden [&:not(:empty)]:pt-2">
        <DownloadErrorNotice />
      </div>
      <Thread
        serverRunning={serverRunning}
        onRetry={() => {
          if (last !== undefined) aui.thread.message({ index: messages.length - 1 }).reload()
        }}
        onCancel={() => {
          if (localRunning) aui.thread.cancelRun()
          else cancel.mutate(undefined, { onSuccess: () => void onStopped() })
        }}
        composer={<Composer attachments={attachments} />}
        onDownload={download}
        pendingDownloads={pending}
      />
    </>
  )
}
