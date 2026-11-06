import { useAui, useAuiState } from '@assistant-ui/react'
import { useEffect, useRef, useState } from 'react'
import { cancelRun } from '@/shared/agent-client'
import type { Thread } from '@/shared/threads-api'
import { ChatHeader } from './ChatHeader'
import { ChatRuntimeProvider, useChatHistory } from './ChatRuntimeProvider'
import { ChatSessionList } from './ChatSessionList'
import { paneVisibility } from './panel-layout'
import type { PanelMode } from './panel-layout'
import { ThreadView } from './ThreadView'
import { useChatSessions } from './use-chat-sessions'
import { useThreadRunStatus } from './use-thread-run-status'
import { useViewportSize } from './use-viewport-size'

interface QueuedSend {
  threadId: string
  text: string
}

interface PaneProps {
  activeId: string | null
  activeSession: Thread | undefined
  create: (title?: string) => Promise<Thread>
  rename: (id: string, title: string) => Promise<unknown>
  serverRunning: boolean
  onStopServerRun: () => void
  /** A run of this panel has ended: the list (title, activity, running flag) is stale. */
  onSettled: () => void
}

/** The thread of the active chat; lives inside the runtime provider. */
function ChatPane(props: PaneProps) {
  const { activeId, activeSession, create, rename, onSettled } = props
  const aui = useAui()
  const history = useChatHistory()
  const messageCount = useAuiState((s) => s.thread.messages.length)
  const running = useAuiState((s) => s.thread.isRunning)
  // A question waiting for the freshly created chat to be loaded into the runtime.
  const queued = useRef<QueuedSend | null>(null)

  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) onSettled()
    wasRunning.current = running
  }, [running, onSettled])

  useEffect(() => {
    const next = queued.current
    if (next !== null && history.threadId === next.threadId && history.status === 'ready') {
      queued.current = null
      aui.thread.append(next.text)
    }
  }, [history.threadId, history.status, aui])

  const sendWithoutChat = async (text: string, title?: string): Promise<boolean> => {
    try {
      const created = await create(title)
      queued.current = { threadId: created.id, text }
      return true
    } catch {
      return false
    }
  }

  const quickSearch = (query: string, title: string) => {
    if (activeId === null) {
      void sendWithoutChat(query, title)
      return
    }
    const blank = activeSession !== undefined && !activeSession.titleIsCustom && messageCount === 0
    void (async () => {
      if (blank) await rename(activeId, title).catch(() => undefined)
      aui.thread.append(query)
    })()
  }

  return (
    <ThreadView
      serverRunning={props.serverRunning}
      onStopServerRun={props.onStopServerRun}
      onQuickSearch={quickSearch}
      onSendWithoutChat={activeId === null ? (text) => sendWithoutChat(text) : undefined}
    />
  )
}

export function App() {
  const sessions = useChatSessions()
  const { activeId, create, rename, reload } = sessions
  const { widthPx } = useViewportSize()
  const [mode, setMode] = useState<PanelMode>('chat')
  const [creating, setCreating] = useState(false)
  // Bumped to load the history of the active chat into the runtime again.
  const [epoch, setEpoch] = useState(0)

  const panes = paneVisibility(widthPx, mode)
  const activeSession = sessions.sessions.find((s) => s.id === activeId)

  const run = useThreadRunStatus({
    threadId: activeId,
    running: activeSession?.running ?? false,
    onFinished: () => {
      setEpoch((n) => n + 1)
      void reload()
    },
  })

  // The run flag of a chat is only known after the list is read: refresh it on every switch.
  const previousId = useRef<string | null>(null)
  useEffect(() => {
    if (previousId.current !== null && previousId.current !== activeId) void reload()
    previousId.current = activeId
  }, [activeId, reload])

  const stopServerRun = () => {
    if (activeId === null) return
    cancelRun(activeId)
      .catch(() => undefined)
      .then(() => {
        run.markStopped()
        return reload()
      })
      .catch(() => undefined)
  }

  const createChat = async () => {
    setCreating(true)
    try {
      await create()
      setMode('chat')
    } catch {
      // The list keeps its state: the user can try again.
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="flex h-screen flex-col bg-white text-ink">
      <ChatRuntimeProvider
        key={epoch}
        activeId={activeId}
        onSelect={sessions.select}
        onCreate={() => create()}
      >
        <div className="flex min-h-0 flex-1">
          <div
            className={`${panes.list ? 'flex' : 'hidden'} min-h-0 flex-col ${
              panes.chat ? 'w-75 shrink-0 border-r border-line' : 'flex-1'
            }`}
          >
            <ChatSessionList
              sessions={sessions.sessions}
              activeId={activeId}
              status={sessions.status}
              createDisabled={creating}
              onSelect={(id) => {
                sessions.select(id)
                setMode('chat')
              }}
              onCreate={() => void createChat()}
              onRename={rename}
              onDelete={sessions.remove}
              onRetry={() => void reload()}
              onBack={
                panes.chat
                  ? undefined
                  : () => {
                      setMode('chat')
                    }
              }
            />
          </div>

          <div className={`${panes.chat ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col`}>
            <ChatHeader
              title={activeSession?.title ?? ''}
              running={run.running}
              onOpenList={
                panes.backToList
                  ? () => {
                      setMode('list')
                    }
                  : undefined
              }
              newChatDisabled={creating}
              onNewChat={() => void createChat()}
              onOpenSettings={() => void chrome.runtime.openOptionsPage()}
            />
            <ChatPane
              activeId={activeId}
              activeSession={activeSession}
              create={create}
              rename={rename}
              serverRunning={run.running}
              onStopServerRun={stopServerRun}
              onSettled={() => void reload()}
            />
          </div>
        </div>
      </ChatRuntimeProvider>
    </main>
  )
}
