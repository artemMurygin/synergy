import { useAui, useAuiState } from '@assistant-ui/react'
import {
  AppFrame,
  NotificationsButton,
  PanelHeader,
  chatPaneVisibility,
  useLayoutMode,
} from '@synergy/ui-kit'
import { ListChecks, MessagesSquare } from '@synergy/ui-kit/icons'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTelegramLink } from '@/options/telegram/use-telegram-link'
import { getActiveSection, setActiveSection } from '@/shared/active-section'
import type { Section } from '@/shared/active-section'
import { cancelRun } from '@/shared/agent-client'
import { getAuthState, subscribeAuth } from '@/shared/auth/auth-state'
import { buildRequestUrl } from '@/shared/portal-link'
import { getPortalUrl } from '@/shared/settings'
import type { NotificationDto } from '@/shared/notifications/notifications-schema'
import type { PendingTarget } from '@/shared/notifications/pending-target'
import type { ChatPanelMode } from '@synergy/ui-kit'
import type { Thread, ThreadHistory } from '@/shared/threads-api'
import { ChatRuntimeProvider, useChatHistory } from './ChatRuntimeProvider'
import { ChatSessionList } from './ChatSessionList'
import { ChatTitleBar } from './ChatTitleBar'
import { NotificationsOverlay } from './notifications/NotificationsOverlay'
import { NotificationToast } from './notifications/NotificationToast'
import { useNotifications } from './notifications/use-notifications'
import { usePendingTarget } from './notifications/use-pending-target'
import { PanelActions } from './PanelActions'
import { ProfileMenuContainer } from './ProfileMenuContainer'
import { TelegramPane } from './telegram/TelegramPane'
import { TasksApp } from './tasks/TasksApp'
import { ThreadView } from './ThreadView'
import { useChatSessions } from './use-chat-sessions'
import { useThreadRunStatus } from './use-thread-run-status'

interface QueuedSend {
  threadId: string
  text: string
}

interface FinishedRun {
  threadId: string
  history: ThreadHistory
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
  /** A run of the chat ended on the server: its fresh history goes into the runtime in place. */
  finished: FinishedRun | null
  onFinishedApplied: () => void
}

/** The thread of the active chat; lives inside the runtime provider. */
function ChatPane(props: PaneProps) {
  const { activeId, activeSession, create, rename, onSettled, onFinishedApplied } = props
  const aui = useAui()
  const history = useChatHistory()
  const messageCount = useAuiState((s) => s.thread.messages.length)
  const running = useAuiState((s) => s.thread.isRunning)
  // A question waiting for the freshly created chat to be loaded into the runtime.
  const queued = useRef<QueuedSend | null>(null)

  const { refresh } = history
  const { finished } = props
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

const CHAT_SECTION = { id: 'chat', label: 'Чаты', icon: <MessagesSquare /> }
const TASKS_SECTION = { id: 'tasks', label: 'Задачи', icon: <ListChecks /> }

export function App() {
  const sessions = useChatSessions()
  const { activeId, create, rename, reload } = sessions
  const layout = useLayoutMode()
  const [mode, setMode] = useState<ChatPanelMode>('chat')
  const [creating, setCreating] = useState(false)
  // Run flag reported by the loaded history or a refused question: fresher than the chat list.
  const [reported, setReported] = useState<{ threadId: string; running: boolean } | null>(null)
  const [finished, setFinished] = useState<FinishedRun | null>(null)
  const auth = useSyncExternalStore(subscribeAuth, getAuthState)
  const signedIn = auth.status === 'authenticated'
  const telegram = useTelegramLink(auth.status)
  const [isTelegramOpen, setIsTelegramOpen] = useState(false)
  const [storedSection, setStoredSection] = useState<Section>('chat')
  // The tasks are mounted on first open and then stay mounted with their state.
  const [tasksOpened, setTasksOpened] = useState(false)
  const section: Section = signedIn ? storedSection : 'chat'
  const isSectionChosen = useRef(false)
  const notifications = useNotifications(signedIn)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [requestedTaskId, setRequestedTaskId] = useState<string | null>(null)
  const [portalUnavailable, setPortalUnavailable] = useState(false)
  const notificationsAnchor = useRef<HTMLButtonElement>(null)
  const isOverlayVisible = signedIn && isNotificationsOpen
  const sections = signedIn ? [CHAT_SECTION, TASKS_SECTION] : [CHAT_SECTION]

  useEffect(() => {
    void getActiveSection().then((stored) => {
      if (isSectionChosen.current) return
      setStoredSection(stored)
      if (stored === 'tasks') setTasksOpened(true)
    })
  }, [])

  const changeSection = (next: Section) => {
    isSectionChosen.current = true
    setStoredSection(next)
    if (next === 'tasks') setTasksOpened(true)
    void setActiveSection(next)
  }
  const showTasks = signedIn && tasksOpened

  const showTask = (taskId: string) => {
    changeSection('tasks')
    setRequestedTaskId(taskId)
  }

  const openRequest = (requestId: string) => {
    void getPortalUrl()
      .then((portalUrl) => {
        const url = buildRequestUrl(portalUrl, requestId)
        if (url === null) setPortalUnavailable(true)
        else void chrome.tabs.create({ url })
      })
      .catch(() => {
        setPortalUnavailable(true)
      })
  }

  const openNotification = (notification: NotificationDto) => {
    setIsNotificationsOpen(false)
    if (notifications.toast?.id === notification.id) notifications.dismissToast()
    void notifications.markRead(notification.id)
    if (notification.target.type === 'task') showTask(notification.target.id)
    if (notification.target.type === 'request') openRequest(notification.target.id)
  }

  usePendingTarget((target: PendingTarget) => {
    if (target.kind === 'task') showTask(target.taskId)
    else if (target.kind === 'request') openRequest(target.requestId)
    else setIsNotificationsOpen(true)
  }, signedIn)

  const clearTaskRequest = useCallback(() => {
    setRequestedTaskId(null)
  }, [])

  const closeNotifications = useCallback(() => {
    setIsNotificationsOpen(false)
  }, [])

  const trailing = signedIn ? (
    <>
      <NotificationsButton
        ref={notificationsAnchor}
        count={notifications.unreadCount}
        open={isOverlayVisible}
        onClick={() => {
          if (!isNotificationsOpen) notifications.dismissToast()
          setIsNotificationsOpen(!isNotificationsOpen)
        }}
      />
      <ProfileMenuContainer
        link={telegram}
        onOpenTelegram={() => {
          setIsTelegramOpen(true)
        }}
      />
    </>
  ) : undefined
  // The rail carries notifications and the profile on tablet; the top bar of the active section on mobile.
  const isMobile = layout === 'mobile'
  const barTrailing = (forSection: Section) =>
    isMobile && section === forSection ? trailing : undefined

  const panes = chatPaneVisibility(layout, mode)
  const activeSession = sessions.sessions.find((s) => s.id === activeId)

  const run = useThreadRunStatus({
    threadId: activeId,
    running: reported?.threadId === activeId ? reported.running : (activeSession?.running ?? false),
    onFinished: (finishedHistory) => {
      if (activeId !== null) {
        setReported({ threadId: activeId, running: false })
        setFinished({ threadId: activeId, history: finishedHistory })
      }
      void reload()
    },
  })

  // The run flag of a chat is only known after the list is read: refresh it on every switch.
  const previousId = useRef<string | null>(null)
  useEffect(() => {
    if (previousId.current !== null && previousId.current !== activeId) void reload()
    previousId.current = activeId
  }, [activeId, reload])

  const clearFinished = useCallback(() => {
    setFinished(null)
  }, [])

  const stopServerRun = () => {
    if (activeId === null) return
    cancelRun(activeId)
      .catch(() => undefined)
      .then(() => {
        setReported({ threadId: activeId, running: false })
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
    <main className="relative h-screen overflow-hidden bg-surface text-ink">
      <AppFrame
        sections={sections}
        activeSection={section}
        onSectionChange={(id) => {
          changeSection(id === 'tasks' ? 'tasks' : 'chat')
        }}
        nav={isMobile ? undefined : trailing}
        body={
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface ${
              isMobile ? '' : 'rounded-xl shadow-panel'
            }`}
          >
      <ChatRuntimeProvider
        activeId={activeId}
        onRunningChange={(threadId, running) => {
          setReported({ threadId, running })
        }}
        onSelect={sessions.select}
        onCreate={() => create()}
      >
        <div
          data-section="chat"
          className={section === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
        >
          <PanelHeader
            title="Чат с агентом"
            actions={
              <PanelActions
                actionLabel="Новый чат"
                actionDisabled={creating}
                onAction={() => void createChat()}
                onOpenSettings={() => void chrome.runtime.openOptionsPage()}
                trailing={barTrailing('chat')}
              />
            }
          />
          <div className="flex min-h-0 flex-1">
            <div
              className={`${panes.list ? 'flex' : 'hidden'} min-h-0 flex-col ${
                panes.chat ? 'w-85 shrink-0 border-r border-line' : 'min-w-0 flex-1'
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
              <ChatTitleBar
                title={activeSession?.title ?? ''}
                running={run.running}
                onOpenList={
                  panes.backToList
                    ? () => {
                        setMode('list')
                      }
                    : undefined
                }
              />
              <ChatPane
                activeId={activeId}
                activeSession={activeSession}
                create={create}
                rename={rename}
                serverRunning={run.running}
                onStopServerRun={stopServerRun}
                onSettled={() => void reload()}
                finished={finished}
                onFinishedApplied={clearFinished}
              />
            </div>
          </div>
        </div>
      </ChatRuntimeProvider>
      {showTasks && (
        <div className={section === 'tasks' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          <TasksApp
            requestedTaskId={requestedTaskId}
            onTaskRequestHandled={clearTaskRequest}
            trailing={barTrailing('tasks')}
          />
        </div>
      )}
          </div>
        }
      />
      {isOverlayVisible && (
        <NotificationsOverlay
          items={notifications.items}
          unreadCount={notifications.unreadCount}
          status={notifications.status}
          isInitialLoad={notifications.isInitialLoad}
          hasMore={notifications.hasMore}
          loadMoreStatus={notifications.loadMoreStatus}
          anchorRef={notificationsAnchor}
          onOpen={openNotification}
          onReadAll={() => void notifications.markAllRead()}
          onLoadMore={notifications.loadMore}
          onRetry={notifications.retry}
          onClose={closeNotifications}
        />
      )}
      {signedIn && (
        <TelegramPane open={isTelegramOpen} onOpenChange={setIsTelegramOpen} link={telegram} />
      )}
      {portalUnavailable && (
        <div
          role="alert"
          aria-label="Портал недоступен"
          className="absolute inset-x-3 top-3 z-50 flex items-center justify-between gap-2 rounded-xl bg-brand-red-soft px-3.5 py-3 text-[13px] font-semibold text-brand-red"
        >
          <span>Портал недоступен. Укажите его адрес в настройках расширения.</span>
          <button
            type="button"
            className="shrink-0 hover:text-brand-red-hover"
            onClick={() => {
              setPortalUnavailable(false)
            }}
          >
            Закрыть
          </button>
        </div>
      )}
      {signedIn && notifications.toast !== null && !isOverlayVisible && (
        <NotificationToast
          key={notifications.toast.id}
          notification={notifications.toast}
          onOpen={openNotification}
          onDismiss={notifications.dismissToast}
        />
      )}
    </main>
  )
}
