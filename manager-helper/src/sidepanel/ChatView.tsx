import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { isFormOpen } from './form-visibility'
import { Message } from './Message'
import { NextSteps } from './NextSteps'
import { QuickSearchForm } from './QuickSearchForm'
import type { ChatMessage, HistoryStatus } from './use-chat'

interface Props {
  /** Form state is scoped to the chat: the parent remounts this view with key=sessionId. */
  sessionId: string | null
  messages: ChatMessage[]
  pending: boolean
  historyStatus: HistoryStatus
  draft: string
  onDraftChange: (draft: string) => void
  onSend: (text: string) => void
  onQuickSearch: (query: string, title: string) => void
  onReloadHistory: () => void
}

export function ChatView(props: Props) {
  const { messages, pending, historyStatus, draft, onDraftChange } = props
  // Agent-reply count at which the user re-opened the form; -1 means not re-opened.
  const [openedAt, setOpenedAt] = useState(-1)
  const bottom = useRef<HTMLDivElement>(null)

  const agentCount = messages.filter((m) => m.role === 'agent').length
  const lastMessage = messages.at(-1)
  const formOpen = isFormOpen(agentCount, openedAt)
  // Without a session (no chats yet) the parent creates one on the first send.
  const showContent = historyStatus === 'ready' || historyStatus === 'idle'
  const canSubmit =
    !pending && historyStatus !== 'loading' && historyStatus !== 'error' && draft.trim().length > 0

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending])

  const submit = () => {
    if (!canSubmit) return
    props.onSend(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {historyStatus === 'loading' && (
          <p className="m-auto text-sm text-ink-60">Загружаем историю…</p>
        )}
        {historyStatus === 'error' && (
          <div className="m-auto flex flex-col items-center gap-2 text-center">
            <p className="text-sm text-ink-60">Не удалось загрузить историю чата</p>
            <button
              type="button"
              className="rounded-full border border-line bg-surface-alt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sunken"
              onClick={props.onReloadHistory}
            >
              Повторить
            </button>
          </div>
        )}
        {showContent && messages.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-ink-60">
            Задайте вопрос по ценам, программам и условиям поступления или заполните форму ниже.
          </p>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {pending && (
          <p className="flex items-center gap-2 text-sm text-ink-60">
            <span className="size-2 animate-pulse rounded-full bg-brand-red" />
            Агент думает…
          </p>
        )}
        <div ref={bottom} />
      </div>

      {showContent && (
        <>
          <QuickSearchForm
            open={formOpen}
            onToggle={() => {
              setOpenedAt(formOpen ? -1 : agentCount)
            }}
            pending={pending}
            onSubmit={(query, title) => {
              setOpenedAt(-1)
              props.onQuickSearch(query, title)
            }}
          />
          {!formOpen && lastMessage?.role === 'agent' && (
            <NextSteps
              disabled={pending}
              lastAnswer={lastMessage.text}
              onSend={props.onSend}
              onNewSearch={() => {
                setOpenedAt(agentCount)
              }}
            />
          )}
        </>
      )}

      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-red"
          rows={2}
          placeholder="Вопрос агенту (Enter — отправить)"
          value={draft}
          onChange={(event) => {
            onDraftChange(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="h-10 rounded-full bg-brand-red px-5 text-sm font-semibold text-white hover:bg-brand-red-hover disabled:bg-surface-sunken disabled:text-ink-40"
        >
          Спросить
        </button>
      </form>
    </div>
  )
}
