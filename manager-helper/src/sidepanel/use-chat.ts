import { useCallback, useEffect, useRef, useState } from 'react'
import { askAgent, AskError } from '@/shared/api'
import type { ToolCallTrace } from '@/shared/api'

export type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'agent'; text: string; toolCalls: ToolCallTrace[]; durationMs: number }
  | { id: number; role: 'error'; text: string }

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const nextId = useRef(1)
  const sessionId = useRef(crypto.randomUUID())
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const push = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message])
  }, [])

  const newId = useCallback(() => nextId.current++, [])

  const send = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim()
      if (question.length === 0 || pending) return
      push({ id: newId(), role: 'user', text: question })
      setPending(true)
      const controller = new AbortController()
      abort.current = controller
      try {
        const result = await askAgent(question, sessionId.current, controller.signal)
        push({
          id: newId(),
          role: 'agent',
          text: result.answer.length > 0 ? result.answer : 'Агент не вернул ответ',
          toolCalls: result.toolCalls,
          durationMs: result.durationMs,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        push({
          id: newId(),
          role: 'error',
          text: error instanceof AskError ? error.message : 'Что-то пошло не так',
        })
      } finally {
        setPending(false)
      }
    },
    [pending, push, newId],
  )

  const clear = useCallback(() => {
    abort.current?.abort()
    setPending(false)
    setMessages([])
    sessionId.current = crypto.randomUUID()
  }, [])

  return { messages, pending, send, clear }
}
