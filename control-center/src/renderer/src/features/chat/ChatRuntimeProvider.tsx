import type { HttpAgent, Message, RunAgentInput } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  fromThreadMessageLike,
  generateId
} from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { createAgent } from '@/lib/backend/agent'
import type { MessageAttachment, MessageSource } from '@/lib/backend/schema'
import { cancelRun } from '@/lib/backend/threads.api'

/** An AG-UI message of the history; the server adds its files and source. */
export type ChatHistoryMessage = Message & {
  attachments?: readonly MessageAttachment[]
  source?: MessageSource
}

interface ChatRuntimeProviderProps {
  /** Chat id: it is the AG-UI `threadId` of every run. Mount with a `key` per chat. */
  threadId: string
  /**
   * History of the chat in AG-UI format, loaded when the chat opens. A later history with
   * messages the runtime does not hold (a system message posted meanwhile) replaces the feed.
   */
  initialMessages: readonly ChatHistoryMessage[]
  children: ReactNode
}

const COMPLETE = { type: 'complete', reason: 'unknown' } as const

/** Converts the history into runtime messages; files and source go into `metadata.custom`. */
function toRuntimeMessages(history: readonly ChatHistoryMessage[]) {
  const extras = new Map(history.map((message) => [message.id, message]))
  return fromAgUiMessages([...history]).map((like) => {
    const source = like.id === undefined ? undefined : extras.get(like.id)
    const metadata = (like.metadata ?? {}) as { custom?: Record<string, unknown> }
    const custom = {
      ...metadata.custom,
      attachments: [...(source?.attachments ?? [])],
      source: source?.source ?? 'run'
    }
    return fromThreadMessageLike({ ...like, metadata: { ...metadata, custom } } as typeof like, generateId(), COMPLETE)
  })
}

/**
 * The composer puts the attached file ids into the message run config (`runConfig.custom.fileIds`),
 * which the AG-UI runtime forwards as `forwardedProps.runConfig`. The backend reads `forwardedProps.fileIds`.
 */
export function liftFileIds(input: RunAgentInput): RunAgentInput {
  const props = (input.forwardedProps ?? {}) as Record<string, unknown>
  const runConfig = props.runConfig as Record<string, unknown> | undefined
  const fileIds = runConfig?.fileIds
  if (!Array.isArray(fileIds) || fileIds.length === 0) return input
  return { ...input, forwardedProps: { ...props, fileIds } }
}

function withFileIds(agent: HttpAgent): HttpAgent {
  const run = agent.run.bind(agent)
  agent.run = (input) => run(liftFileIds(input))
  return agent
}

/** Connects the assistant-ui runtime to the AG-UI endpoint of the backend. */
export function ChatRuntimeProvider({
  threadId,
  initialMessages,
  children
}: ChatRuntimeProviderProps) {
  const agent = useMemo(() => withFileIds(createAgent(threadId)), [threadId])

  // Closing the chat tears the runtime down, which aborts its run and fires onCancel.
  // Only an explicit stop may cancel on the server: the answer must keep going otherwise.
  const closing = useRef(false)
  useLayoutEffect(() => {
    closing.current = false
    return () => {
      closing.current = true
    }
  }, [])

  const runtime = useAgUiRuntime({
    agent,
    onCancel: () => {
      if (closing.current) return
      cancelRun(threadId).catch(() => undefined)
    }
  })

  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const imported = useRef<readonly ChatHistoryMessage[] | null>(null)
  useLayoutEffect(() => {
    const thread = runtimeRef.current.thread
    if (imported.current === initialMessages) return
    if (imported.current !== null) {
      // A refetched history: replace the feed only when it brings messages the runtime lacks
      const state = thread.getState()
      if (state.isRunning) return
      const held = new Set(state.messages.map((message) => message.id))
      if (initialMessages.every((message) => held.has(message.id))) return
    }
    imported.current = initialMessages
    thread.import(ExportedMessageRepository.fromArray(toRuntimeMessages(initialMessages)))
  }, [initialMessages])

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
