/* eslint-disable @typescript-eslint/no-deprecated -- the message converters of assistant-ui are the experimental API this provider is specified to use */
import type { HttpAgent, Message } from '@ag-ui/client'
import {
  AssistantRuntimeProvider,
  ExportedMessageRepository,
  fromThreadMessageLike,
  generateId
} from '@assistant-ui/react'
import { fromAgUiMessages, useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import { USER_MESSAGE_SAVED_EVENT, useServerMessageIds, withFileIds, withReplaceFrom } from '@synergy/ui-kit'
import { catchError, filter, tap, throwError } from 'rxjs'
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { createAgent } from '@/lib/backend/agent'
import type { MessageAttachment, MessageSource } from '@/lib/backend/schema'
import { cancelRun } from '@/lib/backend/threads.api'
import { isRunConflict, isUnreachable, UNREACHABLE_MESSAGE } from './run-errors'

/** An AG-UI message of the history; the server adds its files and source. */
export type ChatHistoryMessage = Message & {
  attachments?: readonly MessageAttachment[]
  source?: MessageSource
  editable?: boolean
}

interface ChatRuntimeProviderProps {
  /** Chat id: it is the AG-UI `threadId` of every run. Mount with a `key` per chat. */
  threadId: string
  /**
   * History of the chat in AG-UI format, loaded when the chat opens. A later history with
   * messages the runtime does not hold (a system message posted meanwhile) replaces the feed.
   */
  initialMessages: readonly ChatHistoryMessage[]
  /** A run that restarted the chat from a message has finished: the app rereads the history. */
  onRestarted?: () => void
  children: ReactNode
}

/** What the thread needs to restart the chat from a question (edit, "Повторить"). */
export interface ChatRestart {
  /** "Изменить" is allowed: the server id of the question is known and it is `editable`. */
  isEditable: (localId: string) => boolean
  /** The next run replaces the chat from this question (nothing is set when its server id is unknown). */
  restartFrom: (localId: string) => void
}

const RestartContext = createContext<ChatRestart>({ isEditable: () => false, restartFrom: () => undefined })

export function useChatRestart(): ChatRestart {
  return useContext(RestartContext)
}

const COMPLETE = { type: 'complete', reason: 'unknown' } as const

/** `durationMs` of the stored tool calls by call id: AG-UI conversion drops the field. */
function toolDurations(history: readonly ChatHistoryMessage[]): Map<string, number> {
  const durations = new Map<string, number>()
  for (const message of history) {
    if (message.role !== 'assistant') continue
    for (const call of message.toolCalls ?? []) {
      if ('durationMs' in call && typeof call.durationMs === 'number') durations.set(call.id, call.durationMs)
    }
  }
  return durations
}

/** Converts the history into runtime messages; files and source go into `metadata.custom`, call durations into the artifact. */
function toRuntimeMessages(history: readonly ChatHistoryMessage[]) {
  const extras = new Map(history.map((message) => [message.id, message]))
  const durations = toolDurations(history)
  return fromAgUiMessages([...history]).map((converted) => {
    const like =
      durations.size === 0 || typeof converted.content === 'string'
        ? converted
        : {
            ...converted,
            content: converted.content.map((part) => {
              if (part.type !== 'tool-call') return part
              const durationMs = part.toolCallId === undefined ? undefined : durations.get(part.toolCallId)
              return durationMs === undefined ? part : { ...part, artifact: { durationMs } }
            })
          }
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

function isSavedEvent(event: { type: string }): boolean {
  return event.type === 'CUSTOM' && (event as unknown as { name?: string }).name === USER_MESSAGE_SAVED_EVENT
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
  onRestarted,
  children
}: ChatRuntimeProviderProps) {
  const ids = useServerMessageIds()
  const idsRef = useRef(ids)
  const pending = useRef<string | null>(null)
  const restarting = useRef(false)
  const runtimeRef = useRef<ReturnType<typeof useAgUiRuntime> | null>(null)
  const onRestartedRef = useRef(onRestarted)
  useLayoutEffect(() => {
    idsRef.current = ids
    onRestartedRef.current = onRestarted
  })

  const agent = useMemo(() => {
    const base = withFileIds(createAgent(threadId))
    // The run that restarts the chat carries the point; the server names the saved question first
    const withPoint = withReplaceFrom(base, () => {
      const point = pending.current
      pending.current = null
      restarting.current = point !== null
      return point
    })
    const run = withPoint.run.bind(withPoint)
    withPoint.run = (input) =>
      run(input).pipe(
        tap({
          next: (event) => {
            if (event.type !== 'CUSTOM') return
            const custom = event as unknown as { name: string; value?: unknown }
            if (custom.name !== USER_MESSAGE_SAVED_EVENT) return
            const messages = runtimeRef.current?.thread.getState().messages ?? []
            const question = messages.filter((message) => message.role === 'user').at(-1)
            if (question !== undefined) idsRef.current.onCustomEvent(custom, question.id)
          },
          complete: () => {
            if (!restarting.current) return
            restarting.current = false
            onRestartedRef.current?.()
          }
        }),
        // The saved event comes before RUN_STARTED: the AG-UI verifier would reject the stream with it
        filter((event) => !isSavedEvent(event))
      )
    return withReadableErrors(withPoint)
  }, [threadId])

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

  useLayoutEffect(() => {
    runtimeRef.current = runtime
  })
  const imported = useRef<readonly ChatHistoryMessage[] | null>(null)
  useLayoutEffect(() => {
    if (runtimeRef.current === null) return
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
    idsRef.current.setFromHistory(initialMessages)
    thread.import(ExportedMessageRepository.fromArray(toRuntimeMessages(initialMessages)))
  }, [initialMessages])

  const restart = useMemo<ChatRestart>(
    () => ({
      isEditable: ids.isEditable,
      restartFrom: (localId) => {
        // A question the server locked (created before rewind points) cannot be a restart point
        pending.current = ids.isEditable(localId) ? (ids.serverIdOf(localId) ?? null) : null
      }
    }),
    [ids]
  )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <RestartContext.Provider value={restart}>{children}</RestartContext.Provider>
    </AssistantRuntimeProvider>
  )
}
