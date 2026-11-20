import {
  ThreadPrimitive,
  useAui,
  useAuiState,
  useThreadViewport,
  useThreadViewportStore,
} from '@assistant-ui/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Connection } from './connection/use-server-reachability'
import { ChatSearchQueryContext, useChatSearch } from './chat-search-context'
import { ChatSearchBar } from './ChatSearchBar'
import { ConnectionBanner } from './ConnectionBanner'
import type { MessageFile } from './attachments/file-upload-port'
import { AssistantMessage } from './AssistantMessage'
import { NewMessageButton } from './NewMessageButton'
import { NextSteps } from './NextSteps'
import { RunNotice } from './RunNotice'
import { RunningIndicator } from './RunningIndicator'
import { ThreadActionsContext } from './thread-context'
import { ThreadWelcome } from './ThreadWelcome'
import { UserMessage } from './UserMessage'

export type ThreadProps = {
  /** The server still runs the agent of this chat (the app came back to a run in progress). */
  serverRunning: boolean
  /** Text of the connection error (the app normalizes it); null or absent when there is none. */
  runError?: string | null
  /** Re-asks the question after an error or a stop. */
  onRetry: () => void
  /** Stops the run: a local one or one that goes on the server. */
  onCancel: () => void
  /** The form of sending (`Composer`). */
  composer: ReactNode
  /** Replaces the welcome state of a new chat. */
  empty?: ReactNode
  /** Downloads a file of a message; without it the cards do nothing. */
  onDownload?: (file: MessageFile) => void
  pendingDownloads?: ReadonlySet<string>
  /** Whether a question can be edited: the server id is known and it is `editable`. Without it nothing is editable. */
  isEditable?: (messageId: string) => boolean
  /** A question is sent after an edit: the app sets the restart point for the run. */
  onEdit?: (messageId: string) => void
  /** State of the link to the server (`useServerReachability`); `offline` shows the banner and blocks the form. */
  connection?: Connection
  /** Checks the server again: "Повторить" of the banner. */
  onProbe?: () => void
  /** The probe is running. */
  probing?: boolean
  /** Extra line of the banner (e.g. where to check the address of the server). */
  connectionHint?: string
  /** The server answered 409: the agent still answers this chat. */
  runConflict?: boolean
  /** Search in the loaded messages: the app opens it with the button of the header; the bar sits above the feed. */
  search?: { open: boolean; onClose: () => void }
}

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('')
}

function FeedNewMessage({ count }: { count: number }) {
  const isAtBottom = useThreadViewport((s) => s.isAtBottom)
  const viewport = useThreadViewportStore()
  return (
    <NewMessageButton
      messageCount={count}
      isAtBottom={isAtBottom}
      onScrollToBottom={() => {
        viewport.getState().scrollToBottom({ behavior: 'smooth' })
      }}
    />
  )
}

/** Feed of the chat on assistant-ui primitives: messages, run state, hints and the form of sending. */
export function Thread({
  serverRunning,
  runError,
  onRetry,
  onCancel,
  composer,
  empty,
  onDownload,
  pendingDownloads,
  isEditable,
  onEdit,
  connection = 'online',
  onProbe,
  probing,
  connectionHint,
  runConflict = false,
  search,
}: ThreadProps) {
  const offline = connection === 'offline'
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const aui = useAui()
  const scope = useRef<HTMLDivElement>(null)
  const searching = search?.open === true
  const found = useChatSearch(searching, scope)
  const messages = useAuiState((s) => s.thread.messages)
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const last = messages.at(-1)
  const lastStatus = last?.role === 'assistant' ? last.status : undefined
  const ended = lastStatus?.type === 'incomplete'
  const running = localRunning || serverRunning
  const lastAnswer = last?.role === 'assistant' ? answerText(last.content) : ''

  const actions = useMemo(
    () => ({
      serverRunning,
      onRetry,
      onCancel,
      onDownload,
      pendingDownloads,
      isEditable,
      onEdit,
      editingMessageId,
      setEditingMessageId,
      offline,
    }),
    [
      serverRunning,
      onRetry,
      onCancel,
      onDownload,
      pendingDownloads,
      isEditable,
      onEdit,
      editingMessageId,
      offline,
    ],
  )

  return (
    <ThreadActionsContext.Provider value={actions}>
      <ChatSearchQueryContext.Provider value={found.query}>
        <ThreadPrimitive.Root ref={scope} className="flex min-h-0 flex-1 flex-col font-chat">
          <ChatSearchBar
            open={searching}
            query={found.query}
            onQueryChange={found.setQuery}
            current={found.current}
            total={found.total}
            onNext={found.next}
            onPrev={found.prev}
            onClose={() => {
              found.reset()
              search?.onClose()
            }}
          />
          <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="mx-auto flex w-full max-w-180 flex-1 flex-col gap-3">
              {messages.length === 0 && !serverRunning && (empty ?? <ThreadWelcome />)}
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === 'user' ? <UserMessage /> : <AssistantMessage />
                }
              </ThreadPrimitive.Messages>
              <RunningIndicator serverRunning={serverRunning} />
            </div>
            <div className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-180 flex-col gap-2.5 pt-3 pb-2 sm:pb-6">
              <div className="pointer-events-none flex justify-center empty:hidden [&>*]:pointer-events-auto">
                <FeedNewMessage count={messages.length} />
              </div>
              {offline && (
                <ConnectionBanner
                  onRetry={onProbe ?? onRetry}
                  retrying={probing}
                  hint={connectionHint}
                />
              )}
              {runConflict && <RunNotice kind="conflict" />}
              {!offline && runError !== undefined && runError !== null && (
                <RunNotice
                  kind="error"
                  title="Нет связи с сервером"
                  text={runError}
                  onRetry={onRetry}
                />
              )}
              <NextSteps
                lastAnswer={lastAnswer}
                disabled={running || ended}
                onSend={(query) => {
                  aui.thread.append(query)
                }}
              />
              {composer}
            </div>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </ChatSearchQueryContext.Provider>
    </ThreadActionsContext.Provider>
  )
}
