import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Message } from './Message'
import { useChat } from './use-chat'

export function App() {
  const { messages, pending, send, clear } = useChat()
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending])

  const submit = () => {
    const question = draft
    setDraft('')
    void send(question)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <h1 className="text-sm font-semibold">Manager Helper</h1>
        <div className="flex gap-3 text-xs text-gray-500">
          <button type="button" className="hover:text-gray-900" onClick={clear}>
            Очистить
          </button>
          <button
            type="button"
            className="hover:text-gray-900"
            onClick={() => void chrome.runtime.openOptionsPage()}
          >
            Настройки
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-gray-500">
            Задайте вопрос по ценам, программам и условиям поступления. Например: «Сколько стоит
            Лечебное дело на очной форме после 9 классов?»
          </p>
        )}
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
        {pending && <p className="text-sm text-gray-500">Агент ищет ответ в таблицах…</p>}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-gray-200 p-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          rows={2}
          placeholder="Вопрос агенту (Enter — отправить)"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:bg-gray-300"
        >
          Спросить
        </button>
      </form>
    </main>
  )
}
