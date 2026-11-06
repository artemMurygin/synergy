/* eslint-disable @typescript-eslint/no-deprecated -- the assistant-ui thread list adapter and message converters are the experimental API this provider is specified to use */
import type { HttpAgent } from '@ag-ui/client'
import { AssistantRuntimeProvider, fromThreadMessageLike, generateId } from '@assistant-ui/react'
import type { ThreadMessage } from '@assistant-ui/core'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import type { UseAgUiThreadListAdapter } from '@assistant-ui/react-ag-ui'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { setActiveSessionId } from '@/shared/active-session'
import { cancelRun, createAgent } from '@/shared/agent-client'
import { getThread } from '@/shared/threads-api'
import type { Thread } from '@/shared/threads-api'

export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ChatHistoryState {
  status: HistoryStatus
  /** Loads the history of the active chat again after an error. */
  reload: () => void
}

const ChatHistoryContext = createContext<ChatHistoryState>({
  status: 'idle',
  reload: () => undefined,
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
  children: ReactNode
}

/** Id of the chat whose history failed to load: never equals a real chat id. */
const FAILED = ''

const COMPLETE = { type: 'complete', reason: 'unknown' } as const

function toThreadMessages(messages: Awaited<ReturnType<typeof getThread>>['messages']) {
  return fromAgUiMessages(messages).map((message): ThreadMessage =>
    fromThreadMessageLike(message, generateId(), COMPLETE),
  )
}

/** The chat id is the AG-UI `threadId` of every run the agent starts next. */
function bindThread(agent: HttpAgent, threadId: string): void {
  agent.threadId = threadId
}

/**
 * Connects assistant-ui to the AG-UI endpoint. The chat id is the AG-UI `threadId`:
 * it is set on the agent whenever the active chat changes.
 */
export function ChatRuntimeProvider(props: Props) {
  const [agent, setAgent] = useState<HttpAgent | null>(null)
  const initialId = useRef(props.activeId ?? crypto.randomUUID())

  useEffect(() => {
    let stale = false
    createAgent(initialId.current).then(
      (created) => {
        if (!stale) setAgent(created)
      },
      () => undefined,
    )
    return () => {
      stale = true
    }
  }, [])

  if (agent === null) return null
  return <RuntimeHost agent={agent} {...props} />
}

function RuntimeHost({
  agent,
  activeId,
  onSelect,
  onCreate,
  children,
}: Props & { agent: HttpAgent }) {
  /** Chat whose history the runtime currently holds (`FAILED` after a failed load). */
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [status, setStatus] = useState<HistoryStatus>('idle')
  const [retry, setRetry] = useState(0)

  const latest = useRef({ onSelect, onCreate })
  useEffect(() => {
    latest.current = { onSelect, onCreate }
  })
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
    [agent, loadedId],
  )

  const runtime = useAgUiRuntime({
    agent,
    adapters: { threadList },
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
      reload: () => {
        setRetry((n) => n + 1)
      },
    }),
    [status],
  )

  return (
    <ChatHistoryContext.Provider value={history}>
      <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
    </ChatHistoryContext.Provider>
  )
}
