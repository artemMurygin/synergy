/* eslint-disable @typescript-eslint/no-deprecated -- the message converters of assistant-ui are the experimental API this provider is specified to use */
import type { HttpAgent, Message } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  fromThreadMessageLike,
  generateId
} from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { withFileIds } from '@synergy/ui-kit'
import { catchError, throwError } from 'rxjs'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { createAgent } from '@/lib/backend/agent'
import type { MessageAttachment, MessageSource } from '@/lib/backend/schema'
import { cancelRun } from '@/lib/backend/threads.api'
import { isRunConflict, isUnreachable, UNREACHABLE_MESSAGE } from './run-errors'

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
    const metadata = like.metadata ?? {}
    const custom = {
      ...metadata.custom,
      attachments: [...(source?.attachments ?? [])],
      source: source?.source ?? 'run'
    }
    return fromThreadMessageLike({ ...like, metadata: { ...metadata, custom } }, generateId(), COMPLETE)
  })
}

const CONFLICT_MESSAGE = 'Агент ещё отвечает. Дождитесь ответа или остановите его.'

/** The text of a failed run as the user should read it: HTTP details become a plain sentence. */
function readableRunError(error: unknown): unknown {
  const text = error instanceof Error ? error.message : ''
  if (isRunConflict(text)) return new Error(CONFLICT_MESSAGE)
  if (isUnreachable(text)) return new Error(UNREACHABLE_MESSAGE)
  return error
}

function withReadableErrors(agent: HttpAgent): HttpAgent {
  const run = agent.run.bind(agent)
  agent.run = (input) => run(input).pipe(catchError((error: unknown) => throwError(() => readableRunError(error))))
  return agent
}

/** Connects the assistant-ui runtime to the AG-UI endpoint of the backend. */
export function ChatRuntimeProvider({
  threadId,
  initialMessages,
  children
}: ChatRuntimeProviderProps) {
  const agent = useMemo(() => withReadableErrors(withFileIds(createAgent(threadId))), [threadId])

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
  useLayoutEffect(() => {
    runtimeRef.current = runtime
  })
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
