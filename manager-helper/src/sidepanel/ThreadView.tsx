import { ComposerPrimitive, ThreadPrimitive, useAui, useAuiState } from '@assistant-ui/react'
import { useEffect, useRef, useState } from 'react'
import { AssistantMessage } from './AssistantMessage'
import { useChatHistory } from './ChatRuntimeProvider'
import { isFormOpen } from './form-visibility'
import { NextSteps } from './NextSteps'
import { QuickSearchForm } from './QuickSearchForm'
import { RunningIndicator } from './RunningIndicator'
import { SquareIcon } from './icons'
import { UserMessage } from './UserMessage'

interface Props {
  /** The server still runs the agent of this chat (the panel came back to a run in progress). */
  serverRunning: boolean
  /** Cancels that run on the server: it is not a local run of the runtime. */
  onStopServerRun: () => void
  /** Receives the query and a short chat title built from the form parameters. */
  onQuickSearch: (query: string, title: string) => void
  /**
   * Set while the panel has no chat: the question goes here instead of the runtime, which has
   * no chat to run in. Resolves to `false` when it was not taken (the text stays in the field).
   */
  onSendWithoutChat?: (text: string) => Promise<boolean>
}

const BUTTON =
  'h-13 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors flex items-center justify-center gap-2'

/** Feed of the chat, quick search form, next steps and the composer. */
export function ThreadView({
  serverRunning,
  onStopServerRun,
  onQuickSearch,
  onSendWithoutChat,
}: Props) {
  const aui = useAui()
  const history = useChatHistory()
  const messages = useAuiState((s) => s.thread.messages)
  const localRunning = useAuiState((s) => s.thread.isRunning)
  const lastMessage = messages.at(-1)
  const lastStatus = lastMessage?.role === 'assistant' ? lastMessage.status : undefined
  const failed = lastStatus?.type === 'incomplete' && lastStatus.reason === 'error'

  // Agent-reply count at which the user re-opened the form; -1 means not re-opened.
  const [openedAt, setOpenedAt] = useState(-1)
  const agentCount = messages.filter((m) => m.role === 'assistant').length
  const formOpen = isFormOpen(agentCount, openedAt)

  const running = localRunning || serverRunning
  const showContent = history.status === 'ready' || history.status === 'idle'
  const blocked = history.status === 'loading' || history.status === 'error'

  // The composer empties on send: when the run fails the question goes back into it.
  const restored = useRef('')
  const question = messages.filter((m) => m.role === 'user').at(-1)
  const questionText = question === undefined ? '' : answerText(question.content)
  useEffect(() => {
    if (!failed || questionText === '' || aui.composer.getState().text !== '') return
    restored.current = questionText
    aui.composer.setText(questionText)
  }, [failed, questionText, aui])
  // A retry sends the question again: the restored copy must not stay behind.
  useEffect(() => {
    if (
      localRunning &&
      restored.current !== '' &&
      aui.composer.getState().text === restored.current
    ) {
      aui.composer.setText('')
    }
    if (localRunning) restored.current = ''
  }, [localRunning, aui])

  const composerText = useAuiState((s) => s.composer.text)
  const submitWithoutChat = () => {
    const text = composerText.trim()
    if (onSendWithoutChat === undefined || text === '') return
    void onSendWithoutChat(text).then((taken) => {
      if (taken) aui.composer.setText('')
    })
  }

  const lastAnswer = lastMessage?.role === 'assistant' ? answerText(lastMessage.content) : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {history.status === 'loading' && (
            <p className="m-auto text-sm text-ink-60">Загружаем историю…</p>
          )}
          {history.status === 'error' && (
            <div className="m-auto flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-ink-60">Не удалось загрузить историю чата</p>
              <button
                type="button"
                className="rounded-full border border-line bg-surface-alt px-4 py-1.5 text-sm font-semibold text-ink hover:bg-surface-sunken"
                onClick={history.reload}
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
          <ThreadPrimitive.Messages>
            {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
          </ThreadPrimitive.Messages>
          {localRunning && (
            <p className="flex items-center gap-2 text-[13px] text-ink-60">
              <span className="size-2 animate-pulse rounded-full bg-brand-red" />
              Агент отвечает…
            </p>
          )}
          {serverRunning && !localRunning && <RunningIndicator variant="running" />}
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>

      {showContent && (
        <div className={running ? 'opacity-50' : undefined}>
          <QuickSearchForm
            open={formOpen}
            onToggle={() => {
              setOpenedAt(formOpen ? -1 : agentCount)
            }}
            pending={running}
            onSubmit={(query, title) => {
              setOpenedAt(-1)
              onQuickSearch(query, title)
            }}
          />
          {!formOpen && lastMessage?.role === 'assistant' && (
            <NextSteps
              disabled={running}
              lastAnswer={lastAnswer}
              onSend={(query) => {
                aui.thread.append(query)
              }}
              onNewSearch={() => {
                setOpenedAt(agentCount)
              }}
            />
          )}
        </div>
      )}

      <ComposerPrimitive.Root
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(event) => {
          if (onSendWithoutChat === undefined) return
          // Enter submits the form: without a chat the panel creates one first.
          event.preventDefault()
          submitWithoutChat()
        }}
      >
        <ComposerPrimitive.Input
          rows={2}
          disabled={blocked || serverRunning}
          placeholder="Вопрос агенту (Enter — отправить)"
          className="max-h-32 min-h-13 flex-1 resize-none rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-brand-red disabled:bg-surface-alt"
        />
        {running ? (
          <button
            type="button"
            className={`${BUTTON} border border-[#cacacb] bg-white text-ink hover:bg-surface-alt`}
            onClick={() => {
              if (localRunning) aui.thread.cancelRun()
              else onStopServerRun()
            }}
          >
            <SquareIcon />
            Остановить
          </button>
        ) : onSendWithoutChat !== undefined ? (
          <button
            type="submit"
            disabled={blocked || composerText.trim() === ''}
            className={`${BUTTON} bg-brand-red text-white hover:bg-brand-red-hover disabled:bg-surface-sunken disabled:text-ink-40`}
          >
            Спросить
          </button>
        ) : (
          <ComposerPrimitive.Send
            disabled={blocked}
            className={`${BUTTON} bg-brand-red text-white hover:bg-brand-red-hover disabled:bg-surface-sunken disabled:text-ink-40`}
          >
            Спросить
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
    </div>
  )
}

function answerText(content: readonly { type: string; text?: string }[]): string {
  return content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('')
}
