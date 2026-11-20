/* eslint-disable @typescript-eslint/no-deprecated -- the assistant-ui thread list adapter and message converters are the experimental API this provider is specified to use */
import type { HttpAgent } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  useAuiState,
  ExportedMessageRepository,
  fromThreadMessageLike,
  generateId,
} from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/core'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { UseAgUiThreadListAdapter } from '@assistant-ui/react-ag-ui'
import {
  connectRestartRuns,
  useServerMessageIds,
  useServerReachability,
  withToolDurations,
} from '@synergy/ui-kit'
import type { Connection } from '@synergy/ui-kit'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { setActiveSessionId } from '@/shared/active-session'
import { cancelRun, createAgent, isRunConflict } from '@/shared/agent-client'
import { getBackendUrl } from '@/shared/settings'
import { isUnreachable } from '@/shared/unreachable'
import { getThread } from '@/shared/threads-api'
import type { Thread, ThreadHistory } from '@/shared/threads-api'

export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ChatHistoryState {
  status: HistoryStatus
  /** Chat whose history the runtime holds now; `null` while there is none. */
  threadId: string | null
  /** Loads the history of the active chat again after an error. */
  reload: () => void
  /** Puts a freshly read history of the active chat into the runtime, keeping the composer. */
  refresh: (threadId: string, history: ThreadHistory) => void
  /** "Изменить" is allowed: the server id of the question is known and the server can restart from it. */
  isEditable: (messageId: string) => boolean
  /** The next run replaces the chat from this question (an edit or a retry); unknown to the server: nothing changes. */
  restartFrom: (messageId: string) => void
  /** State of the link to the server and the check of it (`GET /health`). */
  connection: Connection
  probe: () => void
  probing: boolean
}

const ChatHistoryContext = createContext<ChatHistoryState>({
  status: 'idle',
  threadId: null,
  reload: () => undefined,
  refresh: () => undefined,
  isEditable: () => false,
  restartFrom: () => undefined,
  connection: 'online',
  probe: () => undefined,
  probing: false,
})

/** State of loading the active chat history into the runtime. */
export function useChatHistory(): ChatHistoryState {
  return useContext(ChatHistoryContext)
}

interface Props {
  /** Chat shown in the panel; `null` while there is none. */
  activeId: string | null
  /** The runtime made `id` the active chat. */
  onSelect: (id: string) => void
  /** Creates a chat and makes it active (the runtime asks for it on "new thread"). */
  onCreate: () => Promise<Pick<Thread, 'id'>>
  /**
   * The server run flag of a chat became known: the history was loaded, or a question was
   * refused because the chat already has a run.
   */
  onRunningChange?: (threadId: string, running: boolean) => void
  children: ReactNode
}

/** Id of the chat whose history failed to load: never equals a real chat id. */
const FAILED = ''

const COMPLETE = { type: 'complete', reason: 'unknown' } as const

/** Converts the history into runtime messages; files and source go into `metadata.custom`, call durations into the artifact. */
function toThreadMessages(messages: ThreadHistory['messages']) {
  const extras = new Map(messages.map((message) => [message.id, message]))
  return withToolDurations(messages, fromAgUiMessages([...messages])).map((like): ThreadMessage => {
    const extra = like.id === undefined ? undefined : extras.get(like.id)
    const metadata = like.metadata ?? {}
    const custom = {
      ...metadata.custom,
      attachments: [...(extra?.attachments ?? [])],
      source: extra?.source ?? 'run',
    }
    return fromThreadMessageLike({ ...like, metadata: { ...metadata, custom } }, generateId(), COMPLETE)
  })
}

/** The chat id is the AG-UI `threadId` of every run the agent starts next. */
function bindThread(agent: HttpAgent, threadId: string): void {
  agent.threadId = threadId
}

/**
 * Connects assistant-ui to the AG-UI endpoint. The chat id is the AG-UI `threadId`:
 * it is set on the agent whenever the active chat changes.
 */
interface RunHandlers {
  takePending: () => string | null
  onSaved: (event: { name: string; value?: unknown }, localId: string) => void
  onRestarted: () => void
}

/** What the host of the runtime gives the agent wrappers; bound when the host mounts. */
class RunControl {
  private handlers: RunHandlers = {
    takePending: () => null,
    onSaved: () => undefined,
    onRestarted: () => undefined,
  }

  bind(handlers: RunHandlers): void {
    this.handlers = handlers
  }

  readonly takePending = (): string | null => this.handlers.takePending()

  readonly onSaved = (event: { name: string; value?: unknown }, localId: string): void => {
    this.handlers.onSaved(event, localId)
  }

  readonly onRestarted = (): void => {
    this.handlers.onRestarted()
  }
}

export function ChatRuntimeProvider(props: Props) {
  const [agent, setAgent] = useState<HttpAgent | null>(null)
  const initialId = useRef(props.activeId ?? crypto.randomUUID())
  const [control] = useState(() => new RunControl())

  useEffect(() => {
    let stale = false
    createAgent(initialId.current).then(
      (created) => {
        if (!stale) setAgent(connectRestartRuns(created, control))
      },
      () => undefined,
    )
    return () => {
      stale = true
    }
  }, [control])

  if (agent === null) return null
  return <RuntimeHost agent={agent} control={control} {...props} />
}

async function probeHealth(): Promise<boolean> {
  const response = await fetch(`${await getBackendUrl()}/health`)
  return response.ok
}

/** After a restart ran: reads the history again so the feed holds what the server holds. */
function RestartResync(props: { onSettled: () => void }) {
  const running = useAuiState((s) => s.thread.isRunning)
  const was = useRef(false)
  const { onSettled } = props
  useEffect(() => {
    if (was.current && !running) onSettled()
    was.current = running
  }, [running, onSettled])
  return null
}

function RuntimeHost({
  agent,
  control,
  activeId,
  onSelect,
  onCreate,
  onRunningChange,
  children,
}: Props & { agent: HttpAgent; control: RunControl }) {
  /** Chat whose history the runtime currently holds (`FAILED` after a failed load). */
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [status, setStatus] = useState<HistoryStatus>('idle')
  const [retry, setRetry] = useState(0)

  const latest = useRef({ onSelect, onCreate, onRunningChange })
  useEffect(() => {
    latest.current = { onSelect, onCreate, onRunningChange }
  })

  const ids = useServerMessageIds()
  const reachability = useServerReachability(probeHealth)
  const pendingReplace = useRef<string | null>(null)
  const restarted = useRef(false)
  const { reportError, connection, retrying, retry: probeAgain } = reachability
  const { setFromHistory } = ids
  useEffect(() => {
    control.bind({
      takePending: () => {
        const id = pendingReplace.current
        pendingReplace.current = null
        return id
      },
      onSaved: ids.onCustomEvent,
      onRestarted: () => {
        restarted.current = true
      },
    })
  }, [control, ids.onCustomEvent])

  const generation = useRef(0)
  /** A switch is in progress: the run of the previous chat is dropped locally, not cancelled. */
  const switching = useRef(false)
  const creating = useRef(false)
  /** The next "new thread" only empties the runtime (no active chat), it creates nothing. */
  const resetting = useRef(false)
  const attempted = useRef<string | null>(null)

  const threadList = useMemo<UseAgUiThreadListAdapter>(
    () => ({
      threadId: loadedId === null || loadedId === FAILED ? undefined : loadedId,
      onSwitchToThread: async (threadId) => {
        const mine = ++generation.current
        bindThread(agent, threadId)
        setStatus('loading')
        try {
          const history = await getThread(threadId)
          if (mine !== generation.current) return { messages: [] }
          setLoadedId(threadId)
          setStatus('ready')
          setFromHistory(history.messages)
          latest.current.onRunningChange?.(threadId, history.running)
          void setActiveSessionId(threadId)
          latest.current.onSelect(threadId)
          return { messages: toThreadMessages(history.messages) }
        } catch (error) {
          if (mine === generation.current) {
            setLoadedId(FAILED)
            setStatus('error')
          }
          throw error
        }
      },
      onSwitchToNewThread: async () => {
        const mine = ++generation.current
        if (resetting.current) {
          bindThread(agent, crypto.randomUUID())
          setLoadedId(null)
          setStatus('idle')
          return
        }
        creating.current = true
        try {
          const created = await latest.current.onCreate()
          if (mine !== generation.current) return
          bindThread(agent, created.id)
          setLoadedId(created.id)
          setStatus('ready')
          void setActiveSessionId(created.id)
          latest.current.onSelect(created.id)
        } finally {
          creating.current = false
        }
      },
    }),
    [agent, loadedId, setFromHistory],
  )

  const runtime = useAgUiRuntime({
    agent,
    adapters: { threadList },
    onError: (error) => {
      // `createAgent` turned the network failure into a text: the reachability knows the raw kind only.
      if (isUnreachable(error)) reportError(new TypeError('Failed to fetch'))
      if (isRunConflict(error)) latest.current.onRunningChange?.(agent.threadId, true)
    },
    onCancel: () => {
      // Dropping the local run on a chat switch must not stop it on the server.
      if (switching.current) return
      cancelRun(agent.threadId).catch(() => undefined)
    },
  })

  const runtimeRef = useRef(runtime)
  useEffect(() => {
    runtimeRef.current = runtime
  })

  // Bring the runtime to the chat the panel shows.
  useEffect(() => {
    if (creating.current || activeId === loadedId) return
    const key = `${activeId ?? ''}#${String(retry)}`
    if (attempted.current === key) return
    attempted.current = key
    switching.current = true
    resetting.current = activeId === null
    const threads = runtimeRef.current.threads
    const done = activeId === null ? threads.switchToNewThread() : threads.switchToThread(activeId)
    done
      .catch(() => undefined)
      .finally(() => {
        switching.current = false
        resetting.current = false
      })
  }, [activeId, loadedId, retry])

  const history = useMemo<ChatHistoryState>(
    () => ({
      status,
      threadId: loadedId === null || loadedId === FAILED ? null : loadedId,
      reload: () => {
        setRetry((n) => n + 1)
      },
      refresh: (threadId, fresh) => {
        if (threadId !== loadedId) return
        // Same chat, same composer: only the messages are replaced (a switch would drop the draft).
        runtimeRef.current.thread.import(
          ExportedMessageRepository.fromArray(toThreadMessages(fresh.messages)),
        )
        ids.setFromHistory(fresh.messages)
        latest.current.onRunningChange?.(threadId, fresh.running)
      },
      isEditable: ids.isEditable,
      restartFrom: (messageId) => {
        pendingReplace.current = ids.serverIdOf(messageId) ?? null
      },
      connection,
      probe: () => {
        void probeAgain()
      },
      probing: retrying,
    }),
    [status, loadedId, ids, connection, retrying, probeAgain],
  )

  const resync = useCallback(() => {
    if (!restarted.current) return
    restarted.current = false
    const threadId = agent.threadId
    getThread(threadId).then(
      (fresh) => {
        history.refresh(threadId, fresh)
      },
      () => undefined,
    )
  }, [agent, history])

  return (
    <ChatHistoryContext.Provider value={history}>
      <AssistantRuntimeProvider runtime={runtime}>
        <RestartResync onSettled={resync} />
        {children}
      </AssistantRuntimeProvider>
    </ChatHistoryContext.Provider>
  )
}
