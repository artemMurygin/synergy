import { useEffect, useRef, useState } from 'react'
import { ChatHeader } from './ChatHeader'
import { ChatSessionList } from './ChatSessionList'
import { ChatView } from './ChatView'
import { paneVisibility } from './panel-layout'
import type { PanelMode } from './panel-layout'
import { useChat } from './use-chat'
import { useChatSessions } from './use-chat-sessions'
import { useViewportSize } from './use-viewport-size'

interface QueuedSend {
  sessionId: string
  text: string
}

export function App() {
  const sessions = useChatSessions()
  const { activeId, create, rename, reload } = sessions
  const chat = useChat(activeId, { onSettled: () => void reload() })
  const { widthPx } = useViewportSize()
  const [mode, setMode] = useState<PanelMode>('chat')
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  // A message waiting for a freshly created chat to finish loading.
  const queued = useRef<QueuedSend | null>(null)

  const panes = paneVisibility(widthPx, mode)
  const activeSession = sessions.sessions.find((s) => s.id === activeId)

  const { historyStatus, send } = chat
  useEffect(() => {
    const next = queued.current
    if (next !== null && next.sessionId === activeId && historyStatus === 'ready') {
      queued.current = null
      void send(next.text)
    }
  }, [activeId, historyStatus, send])

  const createChat = async (title?: string): Promise<string | null> => {
    setCreating(true)
    try {
      const created = await create(title)
      setDraft('')
      setMode('chat')
      return created.id
    } catch {
      return null
    } finally {
      setCreating(false)
    }
  }

  const sendMessage = async (text: string, title?: string) => {
    if (activeId === null) {
      const id = await createChat(title)
      if (id !== null) queued.current = { sessionId: id, text }
      return
    }
    const isBlankChat =
      activeSession !== undefined && !activeSession.titleIsCustom && chat.messages.length === 0
    if (title !== undefined && isBlankChat) await rename(activeId, title).catch(() => undefined)
    setDraft('')
    void send(text)
  }

  return (
    <main className="flex h-screen flex-col bg-white text-ink">
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
              if (id !== activeId) setDraft('')
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
            running={activeSession?.running}
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
          <ChatView
            key={activeId ?? 'none'}
            sessionId={activeId}
            messages={chat.messages}
            pending={chat.pending}
            historyStatus={chat.historyStatus}
            draft={draft}
            onDraftChange={setDraft}
            onSend={(text) => void sendMessage(text)}
            onQuickSearch={(query, title) => void sendMessage(query, title)}
            onReloadHistory={chat.reloadHistory}
          />
        </div>
      </div>
    </main>
  )
}
