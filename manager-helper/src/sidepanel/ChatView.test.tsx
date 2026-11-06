import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatView } from './ChatView'
import type { ChatMessage } from './use-chat'

const agent = (text: string): ChatMessage => ({
  id: 2,
  role: 'agent',
  text,
  toolCalls: [],
  durationMs: 1000,
})

function setup(props: Partial<Parameters<typeof ChatView>[0]> = {}) {
  const onDraftChange = vi.fn()
  const onSend = vi.fn()
  const onQuickSearch = vi.fn<(query: string, title: string) => void>()
  render(
    <ChatView
      sessionId="s1"
      messages={[]}
      pending={false}
      historyStatus="ready"
      draft=""
      onDraftChange={onDraftChange}
      onSend={onSend}
      onQuickSearch={onQuickSearch}
      onReloadHistory={vi.fn()}
      {...props}
    />,
  )
  return { onDraftChange, onSend, onQuickSearch }
}

describe('ChatView', () => {
  it('shows the empty hint and an expanded quick search form in a chat without answers', () => {
    setup()
    expect(screen.getByText(/Задайте вопрос по ценам/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Начать подбор' })).toBeTruthy()
  })

  it('collapses the form in a chat with answers and shows next steps', () => {
    setup({ messages: [agent('1. A\n2. B')] })
    expect(screen.queryByRole('button', { name: 'Начать подбор' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Подробнее по 1-й' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Новый подбор' }))
    expect(screen.getByRole('button', { name: 'Начать подбор' })).toBeTruthy()
  })

  it('shows the waiting indicator and disables sending while the agent answers', () => {
    setup({ pending: true, draft: 'вопрос', messages: [agent('1. A\n2. B')] })
    expect(screen.getByText('Агент думает…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Спросить' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Подробнее по 1-й' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('disables sending for an empty draft and sends a filled one', () => {
    const empty = setup()
    expect(screen.getByRole('button', { name: 'Спросить' }).hasAttribute('disabled')).toBe(true)
    expect(empty.onSend).not.toHaveBeenCalled()
  })

  it('sends the draft on submit', () => {
    const { onSend } = setup({ draft: ' привет ' })
    fireEvent.click(screen.getByRole('button', { name: 'Спросить' }))
    expect(onSend).toHaveBeenCalledWith(' привет ')
  })

  it('shows a retry button when history failed to load', () => {
    const onReloadHistory = vi.fn()
    setup({ historyStatus: 'error', onReloadHistory })
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onReloadHistory).toHaveBeenCalledTimes(1)
  })

  it('reports quick search query together with a short title', () => {
    const { onQuickSearch } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Начать подбор' }))
    expect(onQuickSearch).toHaveBeenCalledTimes(1)
    const [query, title] = onQuickSearch.mock.calls[0] ?? ['', '']
    expect(query).toContain('Подбери')
    expect(title).toBe('Подбор программ')
  })
})
