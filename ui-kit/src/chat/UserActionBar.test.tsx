import { MessagePrimitive, ThreadPrimitive, useAui } from '@assistant-ui/react'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { RuntimeHarness } from './test-helpers'
import { ThreadActionsContext } from './thread-context'
import { UserActionBar } from './UserActionBar'
import { AssistantMessage } from './AssistantMessage'

const answering: ChatModelAdapter = {
  async *run() {
    await Promise.resolve()
    yield { content: [{ type: 'text', text: 'ответ агента' }] }
  },
}

const hanging: ChatModelAdapter = {
  async *run({ abortSignal }) {
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener('abort', () => {
        resolve()
      })
    })
    yield { content: [{ type: 'text', text: 'часть' }] }
  },
}

function Sender({ text }: { text: string }) {
  const aui = useAui()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    aui.thread.append(text)
  }, [aui, text])
  return null
}

function mount(adapter: ChatModelAdapter, canEdit: boolean, serverRunning = false) {
  render(
    <RuntimeHarness adapter={adapter}>
      <Sender text="Сколько стоит МВА?" />
      <ThreadActionsContext.Provider value={{ serverRunning, onRetry: () => undefined, onCancel: () => undefined }}>
        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === 'user' ? (
              <MessagePrimitive.Root>
                <p>{message.content.map((p) => (p.type === 'text' ? p.text : '')).join('')}</p>
                <UserActionBar canEdit={canEdit} />
              </MessagePrimitive.Root>
            ) : (
              <AssistantMessage />
            )
          }
        </ThreadPrimitive.Messages>
      </ThreadActionsContext.Provider>
    </RuntimeHarness>,
  )
  return userEvent.setup()
}

describe('UserActionBar', () => {
  it('copies the text of the message and shows the confirmation icon', async () => {
    const user = mount(answering, true)
    const copy = await screen.findByRole('button', { name: 'Копировать' })
    expect(copy.querySelector('svg.lucide-copy')).not.toBeNull()
    await user.click(copy)
    expect(await navigator.clipboard.readText()).toBe('Сколько стоит МВА?')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Копировать' }).querySelector('svg.lucide-check')).not.toBeNull()
    })
  })

  it('offers "Изменить" only with canEdit', async () => {
    mount(answering, false)
    await screen.findByRole('button', { name: 'Копировать' })
    expect(screen.queryByRole('button', { name: 'Изменить' })).toBeNull()
  })

  it('shows "Изменить" with canEdit once the answer is done', async () => {
    mount(answering, true)
    await screen.findByText('ответ агента')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Изменить' }).hasAttribute('disabled')).toBe(false)
    })
  })

  it('blocks "Изменить" while the agent answers', async () => {
    mount(hanging, true)
    await screen.findByRole('button', { name: 'Копировать' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Изменить' }).hasAttribute('disabled')).toBe(true)
    })
  })

  it('blocks "Изменить" while the server runs the agent', async () => {
    mount(answering, true, true)
    await screen.findByRole('button', { name: 'Копировать' })
    expect(screen.getByRole('button', { name: 'Изменить' }).hasAttribute('disabled')).toBe(true)
  })

  it('has no "Копировать" under the answer of the agent', async () => {
    mount(answering, true)
    await screen.findByText('ответ агента')
    expect(screen.getAllByRole('button', { name: 'Копировать' })).toHaveLength(1)
  })
})
