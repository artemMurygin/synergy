import { useCallback, useEffect, useRef, useState } from 'react'
import { askAgent, AskError } from '@/shared/api'
import type { ToolCallTrace } from '@/shared/api'
import { getMessages } from '@/shared/chat-sessions-api'

export type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'agent'; text: string; toolCalls: ToolCallTrace[]; durationMs: number }
  | { id: number; role: 'error'; text: string }

export type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ChatState {
  sessionId: string
  status: 'ready' | 'error'
  messages: ChatMessage[]
}

interface Options {
  /** Called once a request of the given chat finished (answer or error), e.g. to refresh the list. */
  onSettled?: (sessionId: string) => void
}

export function useChat(sessionId: string | null, options: Options = {}) {
  const [state, setState] = useState<ChatState | null>(null)
  const [inflight, setInflight] = useState<ReadonlySet<string>>(new Set())
  const inflightRef = useRef(new Set<string>())
  const controllers = useRef(new Set<AbortController>())
  const nextId = useRef(-1)
  const onSettled = useRef(options.onSettled)
  const [reloadTick, setReloadTick] = useState(0)
  const sessionIdRef = useRef(sessionId)
  /** Chat whose history request is in flight. */
  const fetchingRef = useRef<string | null>(null)

  useEffect(() => {
    onSettled.current = options.onSettled
    sessionIdRef.current = sessionId
  })

  useEffect(() => {
    const all = controllers.current
    return () => {
      for (const controller of all) controller.abort()
    }
  }, [])

  useEffect(() => {
    if (sessionId === null) return
    let stale = false
    fetchingRef.current = sessionId
    getMessages(sessionId).then(
      (stored) => {
        if (stale) return
        fetchingRef.current = null
        setState({ sessionId, status: 'ready', messages: stored })
      },
      () => {
        if (stale) return
        fetchingRef.current = null
        setState({ sessionId, status: 'error', messages: [] })
      },
    )
    return () => {
      stale = true
    }
  }, [sessionId, reloadTick])

  const current = state !== null && state.sessionId === sessionId ? state : null
  const historyStatus: HistoryStatus =
    sessionId === null ? 'idle' : current === null ? 'loading' : current.status
  const messages = current?.messages ?? []
  const pending = sessionId !== null && inflight.has(sessionId)

  const append = useCallback((target: string, message: ChatMessage) => {
    setState((prev) =>
      prev !== null && prev.sessionId === target
        ? { ...prev, messages: [...prev.messages, message] }
        : prev,
    )
  }, [])

  const setInflightFor = useCallback((target: string, active: boolean) => {
    if (active) inflightRef.current.add(target)
    else inflightRef.current.delete(target)
    setInflight(new Set(inflightRef.current))
  }, [])

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim()
      if (sessionId === null || question.length === 0) return
      if (historyStatus === 'loading' || inflightRef.current.has(sessionId)) return
      const target = sessionId
      append(target, { id: nextId.current--, role: 'user', text: question })
      setInflightFor(target, true)
      const controller = new AbortController()
      controllers.current.add(controller)
      try {
        const result = await askAgent(question, target, controller.signal)
        append(target, {
          id: nextId.current--,
          role: 'agent',
          text: result.answer.length > 0 ? result.answer : 'Агент не вернул ответ',
          toolCalls: result.toolCalls,
          durationMs: result.durationMs,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        append(target, {
          id: nextId.current--,
          role: 'error',
          text: error instanceof AskError ? error.message : 'Что-то пошло не так',
        })
      } finally {
        controllers.current.delete(controller)
        setInflightFor(target, false)
        // The history of this chat is still loading and was requested before the server stored
        // the answer, so it would drop or overwrite it: load it again.
        if (
          !controller.signal.aborted &&
          sessionIdRef.current === target &&
          fetchingRef.current === target
        ) {
          setReloadTick((tick) => tick + 1)
        }
        if (!controller.signal.aborted) onSettled.current?.(target)
      }
    },
    [sessionId, historyStatus, append, setInflightFor],
  )

  const reloadHistory = useCallback(() => {
    setState(null)
    setReloadTick((tick) => tick + 1)
  }, [])

  return { messages, pending, historyStatus, send, reloadHistory }
}
