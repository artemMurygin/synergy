import { AssistantRuntimeProvider, type ThreadMessageLike, useAui, useAuiState, useExternalStoreRuntime } from '@assistant-ui/react'
import {
  Button,
  ChatHeader,
  Composer,
  Dialog,
  DialogContent,
  PanelHeaderButton,
  RenameThreadInput,
  Skeleton,
  Thread,
  useComposerAttachments,
  useServerReachability,
  useToast
} from '@synergy/ui-kit'
import { PanelLeftOpen, Plus } from '@synergy/ui-kit/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBackend } from '@/lib/backend/client'
import { createThread } from '@/lib/backend/threads.api'
import { threadsQuery, useCreateThread, useDeleteThread, useRenameThread } from '@/lib/backend/threads.queries'
import { formatActivity } from '@/lib/format-activity'
import { useChatStore } from '@/stores/chat.store'
import { ChatRuntimeProvider, useChatRestart } from './ChatRuntimeProvider'
import { DownloadErrorNotice, FileDownloadsProvider, useFileDownloads } from './file-downloads'
import { goneFileId, isFileGone, isUnreachable } from './run-errors'
import { useCancelRun } from './use-cancel-run'
import { useFileUploadPort } from './use-file-upload-port'
import { useThreadHistory } from './use-thread-history'
import { useVoiceTranscriptionPort } from './use-voice-transcription-port'

const POLL_MS = 2000

interface ChatThreadProps {
  /** Set while the chat list is hidden: the button that shows it again and the one that starts a chat. */
  onShowList?: () => void
}

/** Dialog area: the start window of a new chat, or the history and the composer of the active chat. */
export function ChatThread({ onShowList }: ChatThreadProps) {
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  if (activeThreadId === null) return <NewChat onShowList={onShowList} />
  return <OpenChat key={activeThreadId} threadId={activeThreadId} onShowList={onShowList} />
}

interface HeaderProps {
  title?: string
  meta?: string
  onShowList?: () => void
  /** Search, rename and delete of the open chat (`ChatHeader` of the package). */
  chat?: { empty: boolean; onSearch: () => void; onRename: () => void; onDelete: () => void }
  /** Replaces the capsule with the title: the title editor. */
  editor?: React.ReactNode
}

/** Header of the dialog area (ChatHeader of the package): the buttons of the hidden list, then the title. */
function Header({ title = '', meta, onShowList, chat, editor }: HeaderProps) {
  const create = useCreateThread()
  const leading =
    onShowList === undefined ? undefined : (
      <div className="flex h-11 items-center rounded-[22px] bg-surface-alt px-1">
        <PanelHeaderButton label="Показать список чатов" icon={<PanelLeftOpen />} onClick={onShowList} />
        <PanelHeaderButton
          label="Новый чат"
          tone="primary"
          icon={<Plus />}
          disabled={create.isPending}
          onClick={() => {
            create.mutate()
          }}
        />
      </div>
    )
  if (editor !== undefined) {
    return (
      <header className="flex h-16 shrink-0 items-center gap-2 px-3">
        {leading}
        <div className="min-w-0 flex-1">{editor}</div>
      </header>
    )
  }
  // No title yet (no chat open or the list is still loading): only the list buttons, no empty capsule
  if (title === '') return <header className="flex h-16 shrink-0 items-center gap-2 px-3">{leading}</header>
  return (
    <ChatHeader
      title={title}
      meta={meta}
      leading={leading}
      onSearch={chat?.onSearch}
      onRename={chat?.onRename}
      onDelete={chat?.onDelete}
      emptyChat={chat?.empty}
    />
  )
}

/** The probe of the server link: `GET /health`. */
async function probeServer(): Promise<boolean> {
  const response = await fetchBackend('/health')
  return response.ok
}

/** No chat is selected: the start window. The first message creates the chat and is sent in it. */
function NewChat({ onShowList }: { onShowList?: () => void }) {
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const setActiveThread = useChatStore((s) => s.setActiveThread)
  const queryClient = useQueryClient()
  const attachments = useComposerAttachments(useFileUploadPort())
  const voice = useVoiceTranscriptionPort()

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: [],
    isRunning: creating,
    convertMessage: (message) => message,
    onNew: async (message) => {
      const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('')
      const custom = message.metadata.custom as { attachments?: unknown[] } | undefined
      const fileIds = (message.runConfig?.custom as { fileIds?: string[] } | undefined)?.fileIds ?? []
      setCreating(true)
      useChatStore.getState().setPendingFirstMessage({ text, fileIds, files: custom?.attachments ?? [] })
      try {
        const thread = await createThread()
        await queryClient.invalidateQueries({ queryKey: threadsQuery().queryKey })
        setActiveThread(thread.id)
      } catch {
        useChatStore.getState().setPendingFirstMessage(null)
        toast.show({ tone: 'error', title: 'Не удалось создать чат', description: 'Попробуйте ещё раз' })
      } finally {
        setCreating(false)
      }
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header onShowList={onShowList} />
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread
          serverRunning={false}
          onRetry={() => undefined}
          onCancel={() => undefined}
          composer={<Composer attachments={attachments} voice={voice} disabled={creating} />}
        />
      </AssistantRuntimeProvider>
    </div>
  )
}

function ConfirmDelete({ title, pending, onConfirm, onCancel }: { title: string; pending: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onCancel()
      }}
    >
      <DialogContent
        title="Удалить чат?"
        description={`Чат «${title}» и вся его переписка будут удалены.`}
        footer={
          <div className="flex justify-end gap-3 p-4">
            <Button variant="secondary" disabled={pending} onClick={onCancel}>
              Отмена
            </Button>
            <Button disabled={pending} onClick={onConfirm}>
              Удалить
            </Button>
          </div>
        }
      >
        <p className="px-6 pb-4 text-sm text-ink-60">Чат «{title}» и вся его переписка будут удалены.</p>
      </DialogContent>
    </Dialog>
  )
}

interface OpenHeaderProps {
  threadId: string
  onShowList?: () => void
  empty: boolean
  onSearch: () => void
}

function OpenHeader({ threadId, onShowList, empty, onSearch }: OpenHeaderProps) {
  const { data } = useQuery(threadsQuery())
  const toast = useToast()
  const rename = useRenameThread()
  const remove = useDeleteThread()
  const [mode, setMode] = useState<'view' | 'rename' | 'delete'>('view')
  const thread = data?.find((t) => t.id === threadId)
  const title = thread?.title ?? ''

  const failed = (text: string) => {
    toast.show({ tone: 'error', title: text, description: 'Попробуйте ещё раз' })
  }

  return (
    <>
      <Header
        title={title}
        meta={thread ? formatActivity(thread.lastActivityAt) : undefined}
        onShowList={onShowList}
        chat={{
          empty,
          onSearch,
          onRename: () => {
            setMode('rename')
          },
          onDelete: () => {
            setMode('delete')
          }
        }}
        editor={
          mode === 'rename' ? (
            <RenameThreadInput
              initialTitle={title}
              disabled={rename.isPending}
              onCancel={() => {
                setMode('view')
              }}
              onSubmit={(next) => {
                rename.mutate(
                  { id: threadId, title: next },
                  {
                    onSuccess: () => {
                      setMode('view')
                    },
                    onError: () => {
                      failed('Не удалось переименовать чат')
                    }
                  }
                )
              }}
            />
          ) : undefined
        }
      />
      {mode === 'delete' && (
        <ConfirmDelete
          title={title}
          pending={remove.isPending}
          onCancel={() => {
            setMode('view')
          }}
          onConfirm={() => {
            remove.mutate(threadId, {
              onError: () => {
                setMode('view')
                failed('Не удалось удалить чат')
              }
            })
          }}
        />
      )}
    </>
  )
}

function OpenChat({ threadId, onShowList }: { threadId: string; onShowList?: () => void }) {
  const queryClient = useQueryClient()
  const history = useThreadHistory(threadId)
  const { refetch } = history
  const [searching, setSearching] = useState(false)
  const reachability = useServerReachability(probeServer)

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
      <ChatRuntimeProvider
        key={String(history.running)}
        threadId={threadId}
        initialMessages={history.messages}
        onRestarted={() => void refetch()}
      >
        <FileDownloadsProvider>
          <ThreadBody
            threadId={threadId}
            serverRunning={history.running}
            onStopped={refetch}
            reachability={reachability}
            searching={searching}
            onCloseSearch={() => {
              setSearching(false)
            }}
          />
        </FileDownloadsProvider>
      </ChatRuntimeProvider>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OpenHeader
        threadId={threadId}
        onShowList={onShowList}
        empty={!history.isInitialLoad && history.messages.length === 0}
        onSearch={() => {
          setSearching(true)
        }}
      />
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
  reachability: ReturnType<typeof useServerReachability>
  searching: boolean
  onCloseSearch: () => void
}

function ThreadBody({ threadId, serverRunning, onStopped, reachability, searching, onCloseSearch }: ThreadBodyProps) {
  const aui = useAui()
  const restart = useChatRestart()
  const voice = useVoiceTranscriptionPort()
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

  // The first message of a chat created from the start window goes out as soon as the chat opens
  const sentFirst = useRef(false)
  useEffect(() => {
    if (sentFirst.current || messages.length > 0 || serverRunning) return
    const pending = useChatStore.getState().pendingFirstMessage
    if (pending === null) return
    sentFirst.current = true
    useChatStore.getState().setPendingFirstMessage(null)
    aui.thread.append({
      role: 'user',
      content: pending.text === '' ? [] : [{ type: 'text', text: pending.text }],
      runConfig: pending.fileIds.length > 0 ? { custom: { fileIds: [...pending.fileIds] } } : undefined,
      metadata: { custom: { attachments: [...pending.files] } }
    })
  }, [aui, messages.length, serverRunning])

  // A run that did not reach the server switches the screen to "offline"
  const { reportError } = reachability
  useEffect(() => {
    if (failed && isUnreachable(lastError)) reportError(new TypeError('Failed to fetch'))
  }, [failed, lastError, lastId, reportError])
  const probe = useCallback(() => {
    void reachability.retry()
  }, [reachability])

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
        isEditable={restart.isEditable}
        onEdit={restart.restartFrom}
        connection={reachability.connection}
        onProbe={probe}
        probing={reachability.retrying}
        search={{ open: searching, onClose: onCloseSearch }}
        onRetry={() => {
          if (last === undefined) return
          // The question that is asked again replaces the chat from itself on the server: no duplicate there
          if (question !== undefined) restart.restartFrom(question.id)
          aui.thread.message({ index: messages.length - 1 }).reload()
        }}
        onCancel={() => {
          if (localRunning) aui.thread.cancelRun()
          else cancel.mutate(undefined, { onSuccess: () => void onStopped() })
        }}
        composer={<Composer attachments={attachments} voice={voice} />}
        onDownload={download}
        pendingDownloads={pending}
      />
    </>
  )
}
