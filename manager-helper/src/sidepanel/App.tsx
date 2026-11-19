import { AppFrame, NotificationsButton, useLayoutMode } from '@synergy/ui-kit'
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
import { ChatRuntimeProvider } from './ChatRuntimeProvider'
import { ChatPane } from './ChatPane'
import type { FinishedRun } from './ChatPane'
import { NotificationsOverlay } from './notifications/NotificationsOverlay'
import { NotificationToast } from './notifications/NotificationToast'
import { useNotifications } from './notifications/use-notifications'
import { usePendingTarget } from './notifications/use-pending-target'
import { ProfileMenuContainer } from './ProfileMenuContainer'
import { TelegramPane } from './telegram/TelegramPane'
import { TasksApp } from './tasks/TasksApp'
import { useChatSessions } from './use-chat-sessions'
import { useThreadRunStatus } from './use-thread-run-status'

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

  const bell = signedIn ? (
    <NotificationsButton
      ref={notificationsAnchor}
      count={notifications.unreadCount}
      open={isOverlayVisible}
      onClick={() => {
        if (!isNotificationsOpen) notifications.dismissToast()
        setIsNotificationsOpen(!isNotificationsOpen)
      }}
    />
  ) : undefined
  const profile = signedIn ? (
    <ProfileMenuContainer
      link={telegram}
      onOpenTelegram={() => {
        setIsTelegramOpen(true)
      }}
    />
  ) : undefined
  const trailing = signedIn ? (
    <>
      {bell}
      {profile}
    </>
  ) : undefined
  // The rail carries notifications and the profile on tablet; the top bar of the active section on mobile.
  const isMobile = layout === 'mobile'
  const barTrailing = (forSection: Section) =>
    isMobile && section === forSection ? trailing : undefined

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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                <ChatPane
                  sessions={sessions.sessions}
                  status={sessions.status}
                  activeId={activeId}
                  mode={mode}
                  onModeChange={setMode}
                  creating={creating}
                  onCreate={() => void createChat()}
                  onSelect={sessions.select}
                  create={create}
                  rename={rename}
                  remove={sessions.remove}
                  onRetryList={() => void reload()}
                  serverRunning={run.running}
                  onStopServerRun={stopServerRun}
                  onSettled={() => void reload()}
                  finished={finished}
                  onFinishedApplied={clearFinished}
                  notifications={isMobile && section === 'chat' ? bell : undefined}
                  profile={isMobile && section === 'chat' ? profile : undefined}
                />
              </div>
            </ChatRuntimeProvider>
            {showTasks && (
              <div
                className={
                  section === 'tasks'
                    ? `flex min-h-0 flex-1 flex-col overflow-hidden bg-surface ${
                        isMobile ? '' : 'rounded-xl shadow-panel'
                      }`
                    : 'hidden'
                }
              >
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
