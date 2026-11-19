import { useAui, useAuiState } from '@assistant-ui/react'
import {
  ChatHeader,
  ChatList,
  ChatsLayout,
  MobileTopBar,
  chatPaneVisibility,
  formatRelativeDateTime,
  useChatListCollapsed,
  useLayoutMode,
} from '@synergy/ui-kit'
import type { ChatPanelMode, MessageFile } from '@synergy/ui-kit'
import { MessagesSquare } from '@synergy/ui-kit/icons'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Thread, ThreadHistory } from '@/shared/threads-api'
import { useChatHistory } from './ChatRuntimeProvider'
import { ThreadView } from './ThreadView'

interface QueuedSend {
  threadId: string
  text: string
  files: readonly MessageFile[]
}

export interface FinishedRun {
  threadId: string
  history: ThreadHistory
}

interface Props {
  sessions: Thread[]
  status: 'loading' | 'ready' | 'error'
  activeId: string | null
  /** Narrow panel: which of the two panes is shown. */
  mode: ChatPanelMode
  onModeChange: (mode: ChatPanelMode) => void
  creating: boolean
  onCreate: () => void
  onSelect: (id: string) => void
  create: (title?: string) => Promise<Thread>
  rename: (id: string, title: string) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  onRetryList: () => void
  serverRunning: boolean
  onStopServerRun: () => void
  /** A run of this panel has ended: the list (title, activity, running flag) is stale. */
  onSettled: () => void
  /** A run of the chat ended on the server: its fresh history goes into the runtime in place. */
  finished: FinishedRun | null
  onFinishedApplied: () => void
  /** Notifications button of the mobile top bar (the rail carries it on a wide panel). */
  notifications?: ReactNode
  /** Profile button of the mobile top bar (the rail carries it on a wide panel). */
  profile?: ReactNode
}

/** "Сегодня, 14:32" for the header; empty while the chat is not in the list yet. */
function chatMeta(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined
  const text = formatRelativeDateTime(iso)
  return text.charAt(0).toLocaleUpperCase('ru') + text.slice(1)
}

interface ThreadPaneProps {
  activeId: string | null
  activeSession: Thread | undefined
  create: (title?: string) => Promise<Thread>
  rename: (id: string, title: string) => Promise<unknown>
  serverRunning: boolean
  onStopServerRun: () => void
  onSettled: () => void
  finished: FinishedRun | null
  onFinishedApplied: () => void
}

/** The thread of the active chat; lives inside the runtime provider. */
function ThreadPane(props: ThreadPaneProps) {
  const { activeId, activeSession, create, rename, onSettled, onFinishedApplied, finished } = props
  const aui = useAui()
  const history = useChatHistory()
  const messageCount = useAuiState((s) => s.thread.messages.length)
  const running = useAuiState((s) => s.thread.isRunning)
  // A question waiting for the freshly created chat to be loaded into the runtime.
  const queued = useRef<QueuedSend | null>(null)

  const { refresh } = history
  useEffect(() => {
    if (finished === null) return
    refresh(finished.threadId, finished.history)
    onFinishedApplied()
  }, [finished, refresh, onFinishedApplied])

  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) onSettled()
    wasRunning.current = running
  }, [running, onSettled])

  useEffect(() => {
    const next = queued.current
    if (next !== null && history.threadId === next.threadId && history.status === 'ready') {
      queued.current = null
      if (next.files.length === 0) {
        aui.thread.append(next.text)
      } else {
        aui.thread.append({
          role: 'user',
          content: next.text === '' ? [] : [{ type: 'text', text: next.text }],
          runConfig: { custom: { fileIds: next.files.map((file) => file.id) } },
          metadata: { custom: { attachments: next.files } },
        })
      }
    }
  }, [history.threadId, history.status, aui])

  const sendWithoutChat = async (
    text: string,
    title?: string,
    files: readonly MessageFile[] = [],
  ): Promise<boolean> => {
    try {
      const created = await create(title)
      queued.current = { threadId: created.id, text, files }
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
      onSendWithoutChat={
        activeId === null ? (text, files) => sendWithoutChat(text, undefined, files) : undefined
      }
    />
  )
}

/**
 * Chats of the panel (package `ChatsLayout`): the list and the chat in two panels on a wide
 * panel, one screen with the `MobileTopBar` on a narrow one. The runtime lives above, so the
 * draft and the active chat survive the 640 px threshold.
 */
export function ChatPane(props: Props) {
  const layout = useLayoutMode()
  const [collapsed, toggleCollapsed] = useChatListCollapsed()
  const panes = chatPaneVisibility(layout, props.mode)
  const wide = layout !== 'mobile'
  const activeSession = props.sessions.find((s) => s.id === props.activeId)
  const title = activeSession?.title.trim() ? activeSession.title : 'Новый чат'
  const meta = chatMeta(activeSession?.lastActivityAt)

  const listState = props.status === 'ready' && props.sessions.length === 0 ? 'empty' : props.status

  const list = (
    <ChatList
      threads={props.sessions}
      activeId={props.activeId}
      runningIds={props.sessions.filter((s) => s.running).map((s) => s.id)}
      state={listState}
      createDisabled={props.creating}
      hideHeader={!wide}
      collapsed={false}
      onToggleCollapsed={toggleCollapsed}
      onSelect={(id) => {
        props.onSelect(id)
        props.onModeChange('chat')
      }}
      onCreate={props.onCreate}
      onRename={props.rename}
      onDelete={props.remove}
      onRetry={props.onRetryList}
    />
  )

  const thread = (
    <ThreadPane
      activeId={props.activeId}
      activeSession={activeSession}
      create={props.create}
      rename={props.rename}
      serverRunning={props.serverRunning}
      onStopServerRun={props.onStopServerRun}
      onSettled={props.onSettled}
      finished={props.finished}
      onFinishedApplied={props.onFinishedApplied}
    />
  )

  if (!wide) {
    const createBar = (bar: { title: string; meta?: string; onBack?: () => void }) => (
      <MobileTopBar
        {...bar}
        onCreate={props.onCreate}
        notifications={props.notifications}
        profile={props.profile}
      />
    )
    return (
      <ChatsLayout
        mobileScreen={panes.chat ? 'chat' : 'list'}
        list={
          <>
            {createBar({ title: 'Чаты' })}
            {list}
          </>
        }
        chat={
          <>
            {createBar({
              title,
              meta,
              onBack: () => {
                props.onModeChange('list')
              },
            })}
            {thread}
          </>
        }
      />
    )
  }

  return (
    <ChatsLayout
      listHidden={collapsed}
      list={list}
      chat={
        <>
          <ChatHeader
            title={title}
            meta={meta}
            leading={
              collapsed ? (
                <button
                  type="button"
                  aria-label="Показать список чатов"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-ink hover:bg-surface-sunken"
                  onClick={toggleCollapsed}
                >
                  <MessagesSquare />
                </button>
              ) : undefined
            }
          />
          {thread}
        </>
      }
    />
  )
}
