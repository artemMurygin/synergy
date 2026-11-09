import type { Message } from '@ag-ui/client'
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
import { cancelRun } from '@/lib/backend/threads.api'

interface ChatRuntimeProviderProps {
  /** Chat id: it is the AG-UI `threadId` of every run. Mount with a `key` per chat. */
  threadId: string
  /** History of the chat in AG-UI format, loaded once when the chat opens. */
  initialMessages: readonly Message[]
  children: ReactNode
}

const COMPLETE = { type: 'complete', reason: 'unknown' } as const

/** Connects the assistant-ui runtime to the AG-UI endpoint of the backend. */
export function ChatRuntimeProvider({
  threadId,
  initialMessages,
  children
}: ChatRuntimeProviderProps) {
  const agent = useMemo(() => createAgent(threadId), [threadId])

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
  const initial = useRef(initialMessages)
  useLayoutEffect(() => {
    const messages = fromAgUiMessages([...initial.current]).map((message) =>
      fromThreadMessageLike(message, generateId(), COMPLETE)
    )
    runtimeRef.current.thread.import(ExportedMessageRepository.fromArray(messages))
  }, [])

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
